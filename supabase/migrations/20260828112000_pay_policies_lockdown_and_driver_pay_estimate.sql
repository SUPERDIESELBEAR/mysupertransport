-- pay_policies: remove the operator role from the read policy, and give the
-- driver a narrow definer function for the one number he is entitled to see.
--
-- ALREADY APPLIED TO THE LIVE DATABASE 2026-08-28. Written as a file after the
-- fact on 2026-08-28 for the same reason as the equipment-serial migration:
-- the change reached the database and never landed in the repo. Transcribed
-- from pg_policy and pg_get_functiondef on the live catalog. Idempotent.
--
-- WHY. pay_policies_read_staff admitted 'operator' from the table's creation
-- until 2026-08-28, with no row scope. Any signed-in driver could read every
-- company pay policy: every percentage, every company default, every
-- driver-specific override written for someone else. Nothing in the app asked
-- for that; the driver-facing surface needs one number, his own estimate for
-- one of his own loads.

DROP POLICY IF EXISTS pay_policies_read_staff ON public.pay_policies;
CREATE POLICY pay_policies_read_staff
  ON public.pay_policies
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'management'::app_role)
    OR has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'dispatcher'::app_role)
    OR has_role(auth.uid(), 'onboarding_staff'::app_role)
  );

-- The replacement surface. Resolves the caller's own operator row, refuses any
-- load that is not his, applies the policy that governs him on today's date,
-- and returns a single rounded figure plus an `incomplete` flag. It never
-- returns a percentage, a policy id, or anything about another driver.
CREATE OR REPLACE FUNCTION public.driver_load_pay_estimate(_load_id uuid)
RETURNS TABLE(amount numeric, incomplete boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_operator_id uuid;
  v_policy public.pay_policies%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'America/Chicago')::date;
  v_total numeric := 0;
  v_incomplete boolean := false;
  v_class text;
  v_pay_class text;
  v_pct numeric;
  r record;
BEGIN
  amount := NULL;
  incomplete := true;

  SELECT o.id INTO v_operator_id
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
    SELECT pp.* INTO v_policy
      FROM public.pay_policies pp
     WHERE pp.is_company_default AND pp.is_active
     ORDER BY pp.effective_date DESC
     LIMIT 1;
  END IF;

  IF v_policy.id IS NULL THEN
    RETURN NEXT; RETURN;
  END IF;

  FOR r IN
    SELECT lc.charge_type, lc.amount AS charge_amount,
           lc.funding_source, lc.actual_cost
      FROM public.load_charges lc
     WHERE lc.load_id = _load_id
  LOOP
    v_class := CASE
      WHEN r.charge_type IN ('linehaul','fsc','detention','stopoff','lumper',
                             'layover','tonu','reimbursement','other')
        THEN r.charge_type
      ELSE 'other'
    END;

    v_pay_class := coalesce(
      v_policy.charge_pay_classes ->> v_class,
      CASE WHEN v_class = 'reimbursement' THEN 'reimbursement' ELSE 'revenue' END
    );
    IF v_pay_class NOT IN ('revenue', 'reimbursement') THEN
      v_pay_class := CASE WHEN v_class = 'reimbursement'
                          THEN 'reimbursement' ELSE 'revenue' END;
    END IF;

    IF v_pay_class = 'reimbursement' THEN
      IF r.funding_source IS DISTINCT FROM 'driver' THEN CONTINUE; END IF;
      IF r.actual_cost IS NULL THEN
        v_incomplete := true; CONTINUE;
      END IF;
      v_total := v_total + r.actual_cost;
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
  END LOOP;

  amount := round(v_total, 2);
  incomplete := v_incomplete;
  RETURN NEXT;
END;
$function$;

-- The grant as originally applied. REVOKE ... FROM PUBLIC does NOT remove the
-- anon grant that Supabase's default privileges attach at CREATE time — PUBLIC
-- is not anon. That defect is corrected in the migration immediately after
-- this one; the statements are left here as applied so this file is a faithful
-- record of the state it produced.
REVOKE ALL ON FUNCTION public.driver_load_pay_estimate(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_load_pay_estimate(uuid) TO authenticated;
