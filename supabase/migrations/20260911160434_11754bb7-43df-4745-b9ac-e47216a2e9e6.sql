-- Clean Roadside bonus settlement integration + driver-initiated grace requests.
-- Depends on 20260911153000_inspection_program_base.sql (runs first, same draft).
-- Additive only: CHECK extension, new columns, new/replaced functions.

-- =====================================================================
-- 1. Admit inspection_program_payments as a settlement line source.
-- =====================================================================
ALTER TABLE public.settlement_line_items
  DROP CONSTRAINT settlement_line_items_source_table_check;

ALTER TABLE public.settlement_line_items
  ADD CONSTRAINT settlement_line_items_source_table_check
  CHECK (source_table = ANY (ARRAY[
    'loads','fuel_transactions','deductions','deduction_installments',
    'cash_advances','rm_deposits','settlements','accessorial_adjustments',
    'inspection_program_payments']));

COMMENT ON CONSTRAINT settlement_line_items_source_table_check
  ON public.settlement_line_items IS
  'source_table is what the double-pay guard keys on. inspection_program_payments '
  'was added deliberately for the Clean Roadside bonus: an approved bonus is a '
  'SETTLE-ONCE item excluded by settledSourcesEver, stamped settled by '
  'store_settlement_run, and released back to approved if its settlement is replaced.';

-- =====================================================================
-- 2. Grace request columns on inspection_cycles.
-- =====================================================================
ALTER TABLE public.inspection_cycles
  ADD COLUMN IF NOT EXISTS grace_request_status text
    CHECK (grace_request_status IN ('pending', 'approved', 'declined')),
  ADD COLUMN IF NOT EXISTS grace_request_days integer,
  ADD COLUMN IF NOT EXISTS grace_request_reason text,
  ADD COLUMN IF NOT EXISTS grace_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS grace_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS grace_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS grace_decline_reason text;

-- =====================================================================
-- 3. request_inspection_grace — the driver asks. Self-gated in-body.
--    Creates the cycle row when staff have not created one yet, deriving
--    the group from the resolved unit number (same odd/even rule as
--    src/lib/inspectionProgram.ts).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.request_inspection_grace(
  _days integer,
  _reason text
)
RETURNS public.inspection_cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_operator  public.operators;
  v_unit      text;
  v_digits    text;
  v_group     text;
  v_months    integer[];
  v_cycle     public.inspection_cycles;
  v_year      integer;
  v_month     integer;
  i           integer;
  v_settings  public.inspection_program_settings;
BEGIN
  SELECT * INTO v_operator FROM public.operators
   WHERE user_id = auth.uid() AND is_active
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only an active operator may request an inspection extension.' USING ERRCODE = '42501';
  END IF;

  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required so staff can review the request.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_settings FROM public.inspection_program_settings ORDER BY created_at LIMIT 1;
  IF _days IS NULL OR _days < 1 OR _days > COALESCE(v_settings.max_grace_days, 15) THEN
    RAISE EXCEPTION 'An extension must be between 1 and % days.', COALESCE(v_settings.max_grace_days, 15)
      USING ERRCODE = '22023';
  END IF;

  -- Resolve the unit through the one resolver (onboarding first, operators fallback).
  SELECT public.operator_unit_number(os.unit_number, v_operator.unit_number)
    INTO v_unit
  FROM public.onboarding_status os
  WHERE os.operator_id = v_operator.id
  LIMIT 1;
  IF v_unit IS NULL THEN
    v_unit := v_operator.unit_number;
  END IF;

  v_digits := regexp_replace(COALESCE(v_unit, ''), '\D', '', 'g');
  IF v_digits = '' THEN
    RAISE EXCEPTION 'No unit number is on file, so no inspection cycle can be determined. Please contact staff.'
      USING ERRCODE = '22023';
  END IF;
  v_group := CASE WHEN (substr(v_digits, length(v_digits), 1))::integer % 2 = 1 THEN 'A' ELSE 'B' END;
  v_months := CASE WHEN v_group = 'A'
    THEN COALESCE(v_settings.group_a_months, ARRAY[10,1,4,7])
    ELSE COALESCE(v_settings.group_b_months, ARRAY[12,3,6,9]) END;

  -- Current open cycle, or the next assigned month from today.
  SELECT * INTO v_cycle FROM public.inspection_cycles
   WHERE operator_id = v_operator.id AND closed_at IS NULL
   ORDER BY cycle_year DESC, cycle_month DESC
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    v_year := extract(year FROM now())::integer;
    v_month := extract(month FROM now())::integer;
    FOR i IN 0..23 LOOP
      EXIT WHEN v_month = ANY (v_months);
      v_month := v_month + 1;
      IF v_month > 12 THEN v_month := 1; v_year := v_year + 1; END IF;
    END LOOP;
    INSERT INTO public.inspection_cycles (
      operator_id, unit_number, assigned_group, cycle_year, cycle_month, status, created_by, updated_by
    ) VALUES (
      v_operator.id, v_unit, v_group, v_year, v_month,
      CASE WHEN make_date(v_year, v_month, 1) <= current_date THEN 'due'::public.inspection_cycle_status
           ELSE 'upcoming'::public.inspection_cycle_status END,
      auth.uid(), auth.uid()
    )
    ON CONFLICT (operator_id, cycle_year, cycle_month) DO NOTHING
    RETURNING * INTO v_cycle;
    IF NOT FOUND THEN
      SELECT * INTO v_cycle FROM public.inspection_cycles
       WHERE operator_id = v_operator.id AND cycle_year = v_year AND cycle_month = v_month
       FOR UPDATE;
    END IF;
  END IF;

  IF v_cycle.status IN ('submitted', 'closed') THEN
    RAISE EXCEPTION 'This inspection cycle is already submitted.' USING ERRCODE = '42501';
  END IF;
  IF v_cycle.grace_until IS NOT NULL THEN
    RAISE EXCEPTION 'An extension is already active on this cycle.' USING ERRCODE = '42501';
  END IF;
  IF v_cycle.grace_request_status = 'pending' THEN
    RAISE EXCEPTION 'A request is already waiting for staff review on this cycle.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.inspection_cycles
     SET grace_request_status = 'pending',
         grace_request_days = _days,
         grace_request_reason = btrim(_reason),
         grace_requested_at = now(),
         grace_reviewed_by = NULL,
         grace_reviewed_at = NULL,
         grace_decline_reason = NULL,
         updated_at = now(),
         updated_by = auth.uid()
   WHERE id = v_cycle.id
   RETURNING * INTO v_cycle;

  INSERT INTO public.audit_log (action, entity_type, entity_id, actor_id, details)
  VALUES (
    'inspection_grace_requested',
    'inspection_cycles',
    v_cycle.id,
    auth.uid(),
    jsonb_build_object('days', _days, 'reason', btrim(_reason),
                       'cycle', v_cycle.cycle_year || '-' || lpad(v_cycle.cycle_month::text, 2, '0'))
  );

  RETURN v_cycle;
END;
$$;

COMMENT ON FUNCTION public.request_inspection_grace(integer, text) IS
  'Driver-initiated grace request. Self-gated to the signed-in operator, one pending '
  'request per cycle, creates the cycle row from the resolved unit number when staff '
  'have not created one. The allowance itself is still enforced inside '
  'grant_inspection_grace at review time — a request never grants anything.';

REVOKE EXECUTE ON FUNCTION public.request_inspection_grace(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_inspection_grace(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_inspection_grace(integer, text) TO service_role;

-- =====================================================================
-- 4. review_inspection_grace_request — staff approve or decline.
--    Approval delegates to grant_inspection_grace so the 12-month cap and
--    management-override rule are enforced in exactly one place.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.review_inspection_grace_request(
  _cycle_id uuid,
  _approve boolean,
  _decline_reason text DEFAULT NULL,
  _override boolean DEFAULT false
)
RETURNS public.inspection_cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_cycle public.inspection_cycles;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only staff may review an inspection grace request.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_cycle FROM public.inspection_cycles WHERE id = _cycle_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inspection cycle not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_cycle.grace_request_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'There is no pending grace request on this cycle.' USING ERRCODE = '42501';
  END IF;

  IF _approve THEN
    -- grant_inspection_grace re-checks staff, the day bounds, the 12-month
    -- allowance and the management-override requirement, and audit-logs.
    PERFORM public.grant_inspection_grace(
      _cycle_id,
      COALESCE(v_cycle.grace_request_days, 7),
      COALESCE(v_cycle.grace_request_reason, 'driver request'),
      _override
    );
    UPDATE public.inspection_cycles
       SET grace_request_status = 'approved',
           grace_reviewed_by = auth.uid(),
           grace_reviewed_at = now(),
           updated_at = now(),
           updated_by = auth.uid()
     WHERE id = _cycle_id
     RETURNING * INTO v_cycle;

    INSERT INTO public.audit_log (action, entity_type, entity_id, actor_id, details)
    VALUES ('inspection_grace_request_approved', 'inspection_cycles', _cycle_id, auth.uid(),
            jsonb_build_object('days', v_cycle.grace_request_days));
  ELSE
    IF _decline_reason IS NULL OR btrim(_decline_reason) = '' THEN
      RAISE EXCEPTION 'A reason is required when declining a grace request.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.inspection_cycles
       SET grace_request_status = 'declined',
           grace_decline_reason = btrim(_decline_reason),
           grace_reviewed_by = auth.uid(),
           grace_reviewed_at = now(),
           updated_at = now(),
           updated_by = auth.uid()
     WHERE id = _cycle_id
     RETURNING * INTO v_cycle;

    INSERT INTO public.audit_log (action, entity_type, entity_id, actor_id, details)
    VALUES ('inspection_grace_request_declined', 'inspection_cycles', _cycle_id, auth.uid(),
            jsonb_build_object('decline_reason', btrim(_decline_reason)));
  END IF;

  RETURN v_cycle;
END;
$$;

COMMENT ON FUNCTION public.review_inspection_grace_request(uuid, boolean, text, boolean) IS
  'Staff review of a driver grace request. Approval delegates to grant_inspection_grace, '
  'so the allowance cap and management-override rule live in one place. Decline requires '
  'a written reason. Both outcomes are audit-logged.';

REVOKE EXECUTE ON FUNCTION public.review_inspection_grace_request(uuid, boolean, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_inspection_grace_request(uuid, boolean, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_inspection_grace_request(uuid, boolean, text, boolean) TO service_role;

-- =====================================================================
-- 5. store_settlement_run — extend the write-back to inspection payments.
--    Same shape as the accessorial_adjustments write-back: validated, not
--    trusted; released back to approved when a settlement is replaced.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.store_settlement_run(p_period_start date, p_period_end date, p_payday date, p_runs jsonb, p_mode text DEFAULT 'refuse'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_actor_name text := public._audit_actor_name(public.current_profile_id());
  v_run jsonb;
  v_line jsonb;
  v_wh jsonb;
  v_existing public.settlements%ROWTYPE;
  v_id uuid;
  v_results jsonb := '[]'::jsonb;
  v_outcome text;
  v_line_id uuid;
  v_adj public.accessorial_adjustments%ROWTYPE;
  v_adj_operator uuid;
  v_pay public.inspection_program_payments%ROWTYPE;
  v_operator uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'management'::app_role)
          OR public.has_role(auth.uid(), 'owner'::app_role)) THEN
    RAISE EXCEPTION 'Only management or owner may run a settlement.' USING ERRCODE = '42501';
  END IF;

  IF p_mode NOT IN ('refuse', 'replace') THEN
    RAISE EXCEPTION 'Unknown settlement run mode: %', p_mode USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.settlement_write', 'on', true);

  FOR v_run IN SELECT * FROM jsonb_array_elements(coalesce(p_runs, '[]'::jsonb))
  LOOP
    v_operator := (v_run->>'operator_id')::uuid;

    SELECT * INTO v_existing
    FROM public.settlements
    WHERE operator_id = v_operator
      AND period_start = p_period_start;

    IF FOUND THEN
      IF p_mode = 'refuse' THEN
        v_results := v_results || jsonb_build_object(
          'operator_id', v_run->>'operator_id',
          'settlement_id', v_existing.id,
          'outcome', 'refused_existing',
          'existing_net', v_existing.net_amount,
          'existing_status', v_existing.status
        );
        CONTINUE;
      END IF;

      IF v_existing.status = 'paid' THEN
        RAISE EXCEPTION 'Settlement % is PAID and cannot be recomputed. Corrections go through an adjustment on a later settlement.', v_existing.id
          USING ERRCODE = '42501';
      END IF;

      INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
      VALUES (v_actor, v_actor_name, 'settlement_recomputed', 'settlements', v_existing.id,
              to_char(p_period_start, 'YYYY-MM-DD') || ' -> ' || to_char(p_period_end, 'YYYY-MM-DD'),
              jsonb_build_object(
                'previous_net', v_existing.net_amount,
                'previous_status', v_existing.status,
                'new_net', (v_run->>'net_amount')::numeric,
                'new_status', v_run->>'status'
              ));

      -- Release any adjustment this settlement had consumed BEFORE deleting it:
      -- accessorial_adjustments.settlement_id is ON DELETE RESTRICT, so an
      -- unreleased adjustment would block the recompute rather than be paid
      -- twice. Released to `approved`, so the very next run picks it up again.
      UPDATE public.accessorial_adjustments
         SET status = 'approved',
             settlement_id = NULL,
             settlement_line_item_id = NULL,
             updated_at = now(),
             updated_by = v_actor
       WHERE settlement_id = v_existing.id;

      -- Same release for inspection program payments consumed by this settlement.
      UPDATE public.inspection_program_payments
         SET status = 'approved',
             settlement_id = NULL,
             settled_at = NULL,
             updated_at = now(),
             updated_by = v_actor
       WHERE settlement_id = v_existing.id;

      DELETE FROM public.settlements WHERE id = v_existing.id;
      v_outcome := 'replaced';
    ELSE
      v_outcome := 'created';
    END IF;

    INSERT INTO public.settlements (
      operator_id, period_start, period_end, payday, status,
      gross_amount, deductions_amount, net_amount,
      carry_forward_in, carry_forward_out, hold_reason,
      held_at, created_by, updated_by
    ) VALUES (
      v_operator, p_period_start, p_period_end, p_payday,
      (v_run->>'status')::settlement_status,
      coalesce((v_run->>'gross_amount')::numeric, 0),
      coalesce((v_run->>'deductions_amount')::numeric, 0),
      coalesce((v_run->>'net_amount')::numeric, 0),
      coalesce((v_run->>'carry_forward_in')::numeric, 0),
      coalesce((v_run->>'carry_forward_out')::numeric, 0),
      nullif(v_run->>'hold_reason', ''),
      CASE WHEN (v_run->>'status') = 'held' THEN now() ELSE NULL END,
      v_actor, v_actor
    )
    RETURNING id INTO v_id;

    FOR v_line IN SELECT * FROM jsonb_array_elements(coalesce(v_run->'lines', '[]'::jsonb))
    LOOP
      INSERT INTO public.settlement_line_items (
        settlement_id, line_type, amount, description, source_table, source_id, created_by
      ) VALUES (
        v_id, v_line->>'line_type', coalesce((v_line->>'amount')::numeric, 0),
        v_line->>'description',
        nullif(v_line->>'source_table', ''),
        nullif(v_line->>'source_id', '')::uuid,
        v_actor
      )
      RETURNING id INTO v_line_id;

      -- THE WRITE-BACK. An adjustment records its own consumption here and
      -- nowhere else: one writer per state change, and no client role can
      -- reach `settled` (enforce_accessorial_adjustment_transition requires
      -- settlement_writer_active()). The row is VALIDATED, not trusted: the
      -- payload is composed in the browser.
      IF nullif(v_line->>'source_table', '') = 'accessorial_adjustments'
         AND nullif(v_line->>'source_id', '') IS NOT NULL THEN
        SELECT * INTO v_adj
        FROM public.accessorial_adjustments
        WHERE id = (v_line->>'source_id')::uuid
        FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Settlement line references adjustment % which does not exist.',
            v_line->>'source_id' USING ERRCODE = '23503';
        END IF;

        IF v_adj.status <> 'approved' THEN
          RAISE EXCEPTION 'Adjustment % is %, not approved; it cannot be settled.',
            v_adj.reference, v_adj.status USING ERRCODE = '42501';
        END IF;

        IF v_adj.settlement_id IS NOT NULL THEN
          RAISE EXCEPTION 'Adjustment % is already settled on settlement %.',
            v_adj.reference, v_adj.settlement_id USING ERRCODE = '42501';
        END IF;

        SELECT operator_id INTO v_adj_operator FROM public.loads WHERE id = v_adj.load_id;
        IF v_adj_operator IS DISTINCT FROM v_operator THEN
          RAISE EXCEPTION 'Adjustment % belongs to another driver''s load and cannot be paid on this settlement.',
            v_adj.reference USING ERRCODE = '42501';
        END IF;

        UPDATE public.accessorial_adjustments
           SET status = 'settled',
               settlement_id = v_id,
               settlement_line_item_id = v_line_id,
               updated_at = now(),
               updated_by = v_actor
         WHERE id = v_adj.id;
      END IF;

      -- Same write-back for an approved Clean Roadside bonus. Validated, not
      -- trusted: must exist, be approved, belong to THIS operator, and be
      -- unsettled. Stamped settled in the same transaction as the line.
      IF nullif(v_line->>'source_table', '') = 'inspection_program_payments'
         AND nullif(v_line->>'source_id', '') IS NOT NULL THEN
        SELECT * INTO v_pay
        FROM public.inspection_program_payments
        WHERE id = (v_line->>'source_id')::uuid
        FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Settlement line references inspection payment % which does not exist.',
            v_line->>'source_id' USING ERRCODE = '23503';
        END IF;

        IF v_pay.status <> 'approved' THEN
          RAISE EXCEPTION 'Inspection payment % is %, not approved; it cannot be settled.',
            v_pay.id, v_pay.status USING ERRCODE = '42501';
        END IF;

        IF v_pay.settlement_id IS NOT NULL THEN
          RAISE EXCEPTION 'Inspection payment % is already settled on settlement %.',
            v_pay.id, v_pay.settlement_id USING ERRCODE = '42501';
        END IF;

        IF v_pay.operator_id IS DISTINCT FROM v_operator THEN
          RAISE EXCEPTION 'Inspection payment % belongs to another driver and cannot be paid on this settlement.',
            v_pay.id USING ERRCODE = '42501';
        END IF;

        UPDATE public.inspection_program_payments
           SET status = 'settled',
               settlement_id = v_id,
               settled_at = now(),
               updated_at = now(),
               updated_by = v_actor
         WHERE id = v_pay.id;
      END IF;
    END LOOP;

    FOR v_wh IN SELECT * FROM jsonb_array_elements(coalesce(v_run->'withheld', '[]'::jsonb))
    LOOP
      INSERT INTO public.settlement_withheld_loads (
        settlement_id, load_id, load_number, reason_code, message, outstanding, created_by
      ) VALUES (
        v_id,
        nullif(v_wh->>'load_id', '')::uuid,
        v_wh->>'load_number',
        v_wh->>'reason_code',
        v_wh->>'message',
        coalesce(
          (SELECT array_agg(x) FROM jsonb_array_elements_text(coalesce(v_wh->'outstanding', '[]'::jsonb)) t(x)),
          '{}'::text[]
        ),
        v_actor
      );
    END LOOP;

    INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
    VALUES (v_actor, v_actor_name, 'settlement_stored', 'settlements', v_id,
            to_char(p_period_start, 'YYYY-MM-DD') || ' -> ' || to_char(p_period_end, 'YYYY-MM-DD'),
            jsonb_build_object(
              'operator_id', v_run->>'operator_id',
              'net', (v_run->>'net_amount')::numeric,
              'status', v_run->>'status',
              'outcome', v_outcome,
              'line_count', jsonb_array_length(coalesce(v_run->'lines', '[]'::jsonb)),
              'withheld_count', jsonb_array_length(coalesce(v_run->'withheld', '[]'::jsonb))
            ));

    v_results := v_results || jsonb_build_object(
      'operator_id', v_run->>'operator_id',
      'settlement_id', v_id,
      'outcome', v_outcome,
      'net', (v_run->>'net_amount')::numeric,
      'status', v_run->>'status'
    );
  END LOOP;

  PERFORM set_config('app.settlement_write', 'off', true);

  RETURN jsonb_build_object(
    'period_start', p_period_start,
    'period_end', p_period_end,
    'payday', p_payday,
    'mode', p_mode,
    'results', v_results
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.store_settlement_run(date, date, date, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.store_settlement_run(date, date, date, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.store_settlement_run(date, date, date, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.store_settlement_run(date, date, date, jsonb, text) TO service_role;