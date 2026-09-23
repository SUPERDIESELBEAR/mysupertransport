-- DEMO CARRIER, STAGE 2 — items 1, 2 (schema) and 3.
--
-- ITEM 1. public.company_pay_policy_on(date) selected the company-default pay
-- policy with NO company predicate. Under a normal session the restrictive
-- tenant_isolation policy on pay_policies hid the other carrier's row, but all
-- four callers are SECURITY DEFINER and run with RLS NOT applied, so the moment
-- a second rate sheet exists an arbitrary carrier's percentages would price
-- accessorial adjustments, the driver-facing earnings estimate, the driver's
-- fuel discount visibility and the nightly linehaul mirror. Silently.
--
-- The resolver now takes the company. The one-argument form is DROPPED rather
-- than kept: nothing outside these four definer functions ever called it
-- (EXECUTE was service_role-only, and no client or edge function references
-- it), so leaving it in place would only preserve a way to resolve a rate sheet
-- without saying whose it is.

CREATE OR REPLACE FUNCTION public.company_pay_policy_on(_company uuid, _as_of date)
 RETURNS SETOF public.pay_policies
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT pp.*
    FROM public.pay_policies pp
   WHERE _company IS NOT NULL
     AND pp.company_id = _company
     AND pp.is_company_default
     AND pp.is_active
     AND (pp.effective_from IS NULL OR pp.effective_from <= _as_of)
     AND (pp.effective_to   IS NULL OR pp.effective_to   >= _as_of)
   ORDER BY pp.effective_from DESC NULLS LAST,
            pp.effective_date DESC NULLS LAST,
            pp.created_at DESC
   LIMIT 1;
$function$;

COMMENT ON FUNCTION public.company_pay_policy_on(uuid, date) IS
  'The company-default pay policy VERSION in force for _company on _as_of. A NULL company resolves to no row, never to another carrier''s rate sheet. Every caller passes the company it is already working in.';

REVOKE ALL ON FUNCTION public.company_pay_policy_on(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.company_pay_policy_on(uuid, date) FROM anon;
REVOKE ALL ON FUNCTION public.company_pay_policy_on(uuid, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.company_pay_policy_on(uuid, date) TO service_role;

-- CALLER 1 of 4 — the company comes from the LOAD the adjustment is recorded against.
CREATE OR REPLACE FUNCTION public.create_accessorial_adjustment(p_load_id uuid, p_charge_type text, p_amount numeric, p_reason text, p_description text DEFAULT NULL::text, p_funding_source text DEFAULT NULL::text, p_actual_cost numeric DEFAULT NULL::numeric, p_proof_document_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid          uuid := auth.uid();
  v_actor        uuid := public.current_profile_id();
  v_reason       text := nullif(btrim(coalesce(p_reason, '')), '');
  v_load_number  text;
  v_company      uuid;
  v_class        text;
  v_policy       jsonb;
  v_seq          integer;
  v_reference    text;
  v_billing      text;
  v_id           uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'management'::app_role)
          OR public.has_role(v_uid, 'owner'::app_role)
          OR public.has_role(v_uid, 'dispatcher'::app_role)) THEN
    RAISE EXCEPTION 'Only a dispatcher, management or owner may record a late accessorial.'
      USING ERRCODE = '42501';
  END IF;

  -- The load must exist. Its STATUS is deliberately not checked: this path
  -- exists precisely for loads whose money assert_charge_entry_allowed freezes.
  -- Its COMPANY is read here and is the authority for the rate sheet below.
  SELECT load_number, company_id INTO v_load_number, v_company
    FROM public.loads WHERE id = p_load_id;
  IF v_load_number IS NULL THEN
    RAISE EXCEPTION 'Load not found' USING ERRCODE = '23503';
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A late accessorial needs a written reason.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'A late accessorial needs an amount greater than zero.';
  END IF;

  -- Classification, through the SAME gate load_charges uses.
  PERFORM public.assert_known_charge_type(p_charge_type);

  -- ...and it must be one the pay policy in force can actually price, or the
  -- adjustment could be approved and then reach a settlement with no rate.
  -- THE LOAD'S OWN CARRIER's rate sheet, never an arbitrary one.
  SELECT p.charge_pay_classes INTO v_policy
    FROM public.company_pay_policy_on(v_company, (now() AT TIME ZONE 'America/Chicago')::date) p;
  IF v_policy IS NULL THEN
    RAISE EXCEPTION 'No active company-default pay policy; a late accessorial cannot be priced.';
  END IF;
  v_class := v_policy ->> p_charge_type;
  IF v_class IS NULL THEN
    RAISE EXCEPTION 'The pay policy in force cannot price a % charge.', p_charge_type;
  END IF;

  IF p_proof_document_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.load_documents
                      WHERE id = p_proof_document_id AND load_id = p_load_id) THEN
    RAISE EXCEPTION 'That proof document does not belong to this load.';
  END IF;

  -- Serialise sequence allocation per load. UNIQUE (load_id, sequence) is the
  -- backstop if two sessions ever slip past this lock.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('accessorial_adjustments:' || p_load_id::text, 0));

  SELECT coalesce(max(sequence), 0) + 1 INTO v_seq
    FROM public.accessorial_adjustments WHERE load_id = p_load_id;
  v_reference := v_load_number || '-A' || v_seq::text;

  -- Billing state is a FACT about the original invoice, read here, never taken
  -- from the caller. Submitted means the factor already has it.
  SELECT CASE WHEN i.submitted_at IS NOT NULL
              THEN 'pending_supplemental' ELSE 'not_required' END
    INTO v_billing
    FROM public.invoices i WHERE i.load_id = p_load_id;
  v_billing := coalesce(v_billing, 'not_required');

  INSERT INTO public.accessorial_adjustments (
    load_id, reference, sequence, charge_type, description, amount,
    funding_source, actual_cost, proof_document_id,
    status, reason, billing_state, created_by, updated_by
  ) VALUES (
    p_load_id, v_reference, v_seq, p_charge_type,
    nullif(btrim(coalesce(p_description, '')), ''), p_amount,
    nullif(p_funding_source, ''), p_actual_cost, p_proof_document_id,
    'draft', v_reason, v_billing, v_actor, v_actor
  ) RETURNING id INTO v_id;

  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (v_actor, public._audit_actor_name(v_uid), 'accessorial_adjustment_created',
          'accessorial_adjustment', v_id, v_reference,
          jsonb_build_object('load_id', p_load_id, 'charge_type', p_charge_type,
                             'amount', p_amount, 'billing_state', v_billing,
                             'reason', v_reason));
  RETURN v_id;
END;
$function$;

-- CALLER 2 of 4 — the company comes from the DRIVER's own operators row.
CREATE OR REPLACE FUNCTION public.driver_load_pay_estimate(_load_id uuid)
 RETURNS TABLE(amount numeric, incomplete boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_operator_id uuid;
  v_company uuid;
  v_policy public.pay_policies%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'America/Chicago')::date;
  v_total numeric := 0;
  v_incomplete boolean := false;
  v_counted integer := 0;
  v_charge_rows integer := 0;
  v_class text;
  v_pay_class text;
  v_pct numeric;
  r record;
BEGIN
  amount := NULL;
  incomplete := true;

  SELECT o.id, o.company_id INTO v_operator_id, v_company
    FROM public.operators o
    JOIN public.profiles p ON p.user_id = o.user_id
   WHERE p.id = public.current_profile_id()
   LIMIT 1;

  IF v_operator_id IS NULL THEN
    RETURN NEXT; RETURN;
  END IF;

  PERFORM 1 FROM public.loads l
   WHERE l.id = _load_id AND l.operator_id = v_operator_id;
  IF NOT FOUND THEN
    RETURN NEXT; RETURN;
  END IF;

  SELECT pp.* INTO v_policy
    FROM public.pay_policy_assignments a
    JOIN public.pay_policies pp ON pp.id = a.pay_policy_id
   WHERE a.operator_id = v_operator_id
     AND a.effective_start_date <= v_today
     AND (a.effective_end_date IS NULL OR a.effective_end_date >= v_today)
   ORDER BY a.effective_start_date DESC
   LIMIT 1;

  IF v_policy.id IS NULL THEN
    -- HIS carrier's rate sheet, resolved from his operators row.
    SELECT p.* INTO v_policy FROM public.company_pay_policy_on(v_company, v_today) p;
  END IF;

  IF v_policy.id IS NULL THEN
    RETURN NEXT; RETURN;
  END IF;

  SELECT count(*) INTO v_charge_rows
    FROM public.load_charges lc
   WHERE lc.load_id = _load_id;

  -- No charges recorded yet is NOT a zero-dollar load. A load with no priced
  -- work cannot be estimated honestly, so it returns an absent amount and the
  -- UI says so in words rather than showing a fabricated $0.00.
  IF v_charge_rows = 0 THEN
    RETURN NEXT; RETURN;
  END IF;

  FOR r IN
    SELECT lc.charge_type, lc.amount AS charge_amount,
           lc.funding_source, lc.actual_cost
      FROM public.load_charges lc
     WHERE lc.load_id = _load_id
  LOOP
    v_class := public.charge_classification(r.charge_type);

    SELECT cpc.pay_class INTO v_pay_class
      FROM public.charge_pay_classes cpc
     WHERE cpc.classification = v_class
     LIMIT 1;

    IF v_pay_class IS NULL THEN
      v_pay_class := CASE WHEN v_class IN ('lumper','reimbursement')
                        THEN 'reimbursement' ELSE 'revenue' END;
    END IF;

    IF v_pay_class = 'reimbursement' THEN
      IF r.funding_source IS DISTINCT FROM 'driver' THEN CONTINUE; END IF;
      IF r.actual_cost IS NULL THEN
        v_incomplete := true; CONTINUE;
      END IF;
      v_total := v_total + r.actual_cost;
      v_counted := v_counted + 1;
      CONTINUE;
    END IF;

    v_pct := CASE v_class
      WHEN 'linehaul'      THEN v_policy.linehaul_pct
      WHEN 'fsc'           THEN v_policy.fsc_pct
      WHEN 'detention'     THEN v_policy.detention_pct
      WHEN 'stopoff'       THEN v_policy.stopoff_pct
      WHEN 'lumper'        THEN v_policy.lumper_reimbursement_pct
      WHEN 'layover'       THEN v_policy.layover_pct
      WHEN 'tonu'          THEN v_policy.tonu_pct
      ELSE v_policy.other_accessorial_pct
    END;

    IF v_pct IS NULL THEN
      v_incomplete := true; CONTINUE;
    END IF;

    v_total := v_total + coalesce(r.charge_amount, 0) * v_pct / 100;
    v_counted := v_counted + 1;
  END LOOP;

  -- Every charge on the load was unvaluable: again, absence, not zero.
  IF v_counted = 0 THEN
    amount := NULL;
    incomplete := true;
    RETURN NEXT; RETURN;
  END IF;

  amount := round(v_total, 2);
  incomplete := v_incomplete;
  RETURN NEXT;
END;
$function$;

-- CALLER 3 of 4 — the company comes from the FUEL ROW being listed.
CREATE OR REPLACE FUNCTION public.my_fuel_transactions()
 RETURNS TABLE(id uuid, invoice_no text, invoice_date date, merchant_name text, city text, state text, total_amount numeric, fuel_discount_amount numeric, diesel_amount numeric, diesel_gallons numeric, lines jsonb, settlement_id uuid, period_start date, period_end date, payday date, settlement_status text, work_week_start_dow integer, discount_passthrough boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT
    ft.id,
    ft.invoice_no,
    ft.invoice_date,
    ft.merchant_name,
    ft.city,
    ft.state,
    ft.total_amount,
    ft.fuel_discount_amount,
    ft.diesel_amount,
    ft.diesel_gallons,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('line_type', l.line_type, 'amount', l.amount))
        FROM public.fuel_transaction_lines l
       WHERE l.transaction_id = ft.id
    ), '[]'::jsonb),
    s.id,
    s.period_start,
    s.period_end,
    s.payday,
    s.status::text,
    COALESCE((SELECT ss.work_week_start_dow FROM public.settlement_settings ss WHERE ss.company_id = public.current_company_id()), 3),
    -- THE SAME RESOLUTION ORDER THE SETTLEMENT ENGINE USES: the per-driver
    -- setting first, the company default policy as the fallback, off if
    -- neither says otherwise. The driver cannot read pay_policies, so this is
    -- the only way his screen can know whether a discount is his to see.
    -- PASS 1: the fallback is the VERSION IN FORCE TODAY, not an arbitrary row.
    -- STAGE 2: and the version belonging to THIS FUEL ROW'S CARRIER.
    COALESCE(
      o.fuel_discount_passthrough_override,
      (SELECT p.fuel_discount_passthrough
         FROM public.company_pay_policy_on(ft.company_id, (now() AT TIME ZONE 'America/Chicago')::date) p),
      false
    )
  FROM public.fuel_transactions ft
  JOIN public.operators o
    ON o.id = ft.operator_id
   AND o.user_id = auth.uid()
  LEFT JOIN LATERAL (
    SELECT s2.id, s2.period_start, s2.period_end, s2.payday, s2.status
      FROM public.settlement_line_items sli
      JOIN public.settlements s2 ON s2.id = sli.settlement_id
     WHERE sli.source_table = 'fuel_transactions'
       AND sli.source_id = ft.id
     LIMIT 1
  ) s ON TRUE
  WHERE auth.uid() IS NOT NULL;
$function$;

-- CALLER 4 of 4 — the company comes from EACH DRIVER in the loop, so a mixed
-- fleet mirrors every driver from his own carrier's rate sheet.
CREATE OR REPLACE FUNCTION public.sync_operator_linehaul_pct_mirror()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_count integer;
BEGIN
  WITH target AS (
    SELECT o.id,
           coalesce(v.pct, cp.linehaul_pct) AS pct
      FROM public.operators o
      LEFT JOIN public.operator_linehaul_pct_versions v
             ON v.operator_id = o.id
            AND v.effective_from <= CURRENT_DATE
            AND (v.effective_to IS NULL OR v.effective_to >= CURRENT_DATE)
      LEFT JOIN LATERAL public.company_pay_policy_on(o.company_id, CURRENT_DATE) cp ON TRUE
  ), moved AS (
    UPDATE public.operators o
       SET pay_percentage = t.pct::int
      FROM target t
     WHERE o.id = t.id
       AND t.pct IS NOT NULL
       AND o.pay_percentage IS DISTINCT FROM t.pct::int
    RETURNING o.id
  )
  SELECT count(*) INTO v_count FROM moved;

  RETURN v_count;
END;
$function$;

-- The unfiltered form is now unreachable and is removed, not deprecated: a
-- rate-sheet resolver that does not say whose sheet it wants has no legitimate
-- caller left.
DROP FUNCTION public.company_pay_policy_on(date);

-- ITEM 2 (schema half) — the inbound rate-con address, per carrier.
-- receive-rate-con-email receives the recipient list on the Resend
-- `email.received` webhook and nothing else that could identify a carrier, so
-- the recipient address IS the routing key. It is recorded here rather than in
-- an environment variable so a second carrier can have its own mailbox without
-- a redeploy.
ALTER TABLE public.carrier_profile
  ADD COLUMN IF NOT EXISTS rate_con_ingest_address text;

COMMENT ON COLUMN public.carrier_profile.rate_con_ingest_address IS
  'The dedicated inbound mailbox whose mail belongs to this carrier (e.g. rates@parse.<domain>). receive-rate-con-email matches the webhook recipient against it, case-insensitively and ignoring any +tag, to decide whose queue the email lands in.';

CREATE UNIQUE INDEX IF NOT EXISTS carrier_profile_rate_con_ingest_address_unique
  ON public.carrier_profile (lower(rate_con_ingest_address))
  WHERE rate_con_ingest_address IS NOT NULL;

-- Backfill: SUPERTRANSPORT's live ingest address, taken from the address its
-- five existing queue rows were delivered to.
UPDATE public.carrier_profile
   SET rate_con_ingest_address = 'rates@parse.mysupertransport.com'
 WHERE usdot_number = '2309365'
   AND rate_con_ingest_address IS NULL;

-- ITEM 3 — bootstrap_assign_owner is told which company.
-- Caller: service_role ONLY (the bootstrap-admin edge function, behind its
-- shared secret). When p_company_id is omitted it resolves the SOLE carrier and
-- REFUSES with 42501 if there is not exactly one — it never picks.
DROP FUNCTION public.bootstrap_assign_owner(uuid);

CREATE OR REPLACE FUNCTION public.bootstrap_assign_owner(p_user_id uuid, p_company_id uuid DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_label   text;
  v_company uuid := p_company_id;
  v_count   integer;
BEGIN
  IF v_company IS NULL THEN
    SELECT count(*) INTO v_count FROM public.carrier_profile;
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'bootstrap_assign_owner must be given p_company_id: % carrier_profile rows exist, so the company cannot be inferred.', v_count
        USING ERRCODE = '42501';
    END IF;
    SELECT id INTO v_company FROM public.carrier_profile;
  ELSIF NOT EXISTS (SELECT 1 FROM public.carrier_profile WHERE id = v_company) THEN
    RAISE EXCEPTION 'No such company %; an owner cannot be bootstrapped for it.', v_company
      USING ERRCODE = '23503';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE role = 'owner' AND company_id = v_company
  ) THEN
    RAISE EXCEPTION 'An owner already exists for this company; bootstrap cannot assign another owner.'
      USING ERRCODE = '23505';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Bootstrap owner target does not exist.'
      USING ERRCODE = '23503';
  END IF;

  PERFORM set_config('app.owner_role_write', 'on', true);

  INSERT INTO public.user_roles (user_id, role, company_id)
  VALUES (p_user_id, 'owner', v_company);

  INSERT INTO public.company_members (user_id, company_id)
  VALUES (p_user_id, v_company)
  ON CONFLICT (user_id, company_id) DO NOTHING;

  SELECT nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '')
    INTO v_label
    FROM public.profiles p
   WHERE p.user_id = p_user_id;

  INSERT INTO public.audit_log (
    actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata
  ) VALUES (
    NULL,
    'bootstrap-admin',
    'bootstrap_owner_assigned',
    'user',
    p_user_id,
    coalesce(v_label, p_user_id::text),
    jsonb_build_object('mechanism', 'bootstrap_assign_owner', 'company_id', v_company)
  );
END;
$function$;

COMMENT ON FUNCTION public.bootstrap_assign_owner(uuid, uuid) IS
  'Assigns the first owner of a company. service_role only (bootstrap-admin). p_company_id names the carrier; omitted, it resolves the sole carrier and raises 42501 when there is not exactly one.';

REVOKE ALL ON FUNCTION public.bootstrap_assign_owner(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bootstrap_assign_owner(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.bootstrap_assign_owner(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_assign_owner(uuid, uuid) TO service_role;