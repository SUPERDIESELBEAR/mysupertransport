CREATE OR REPLACE FUNCTION public.driver_load_pay_estimate(_load_id uuid)
RETURNS TABLE(amount numeric, incomplete boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public, extensions'
AS $function$
DECLARE
  v_operator_id uuid;
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

REVOKE EXECUTE ON FUNCTION public.driver_load_pay_estimate(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.driver_load_pay_estimate(uuid) TO authenticated;