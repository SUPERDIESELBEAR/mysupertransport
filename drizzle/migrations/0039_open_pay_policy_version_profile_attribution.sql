-- Fix found by the Pass 2 probe before anything shipped: pay_policies.created_by
-- and updated_by reference profiles(id), NOT auth.users, so the 0038 RPC stamped
-- auth.uid() and failed on pay_policies_updated_by_fkey — it could never have
-- opened a version. Attribution now uses public.current_profile_id(), which is
-- what every other writer on this table uses.
CREATE OR REPLACE FUNCTION public.open_pay_policy_version(
  _effective_from date,
  _rates jsonb DEFAULT '{}'::jsonb,
  _name text DEFAULT NULL,
  _description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_cur public.pay_policies;
  v_new_id uuid;
  v_actor uuid := public.current_profile_id();
  v_key text;
  v_allowed text[] := ARRAY[
    'linehaul_pct','fsc_pct','detention_pct','layover_pct','tonu_pct','stopoff_pct',
    'lumper_reimbursement_pct','per_ton_pct','loadout_pct','other_accessorial_pct'
  ];
BEGIN
  IF NOT public.has_permission(auth.uid(), 'pay_policy.change') THEN
    RAISE EXCEPTION
      'Not authorized to change pay policy. Only the owner opens a new pay policy version.'
      USING ERRCODE = '42501';
  END IF;

  IF _effective_from IS NULL THEN
    RAISE EXCEPTION 'A new pay policy version needs the date it takes effect from.'
      USING ERRCODE = '22004';
  END IF;

  IF _effective_from < CURRENT_DATE THEN
    RAISE EXCEPTION
      'A pay policy version cannot start in the past (%). A past work week is always calculated with the rate that was in force for it.',
      _effective_from
      USING ERRCODE = '22007';
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(COALESCE(_rates, '{}'::jsonb)) LOOP
    IF NOT (v_key = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'Unknown pay policy rate "%".', v_key USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT * INTO v_cur
  FROM public.pay_policies
  WHERE company_id = public.current_company_id()
    AND is_company_default
    AND effective_to IS NULL
  FOR UPDATE;

  IF v_cur.id IS NULL THEN
    RAISE EXCEPTION 'No current company pay policy to supersede.' USING ERRCODE = 'P0002';
  END IF;

  IF _effective_from <= COALESCE(v_cur.effective_from, DATE '0001-01-01') THEN
    RAISE EXCEPTION
      'The new version must start after the current one began (%).', v_cur.effective_from
      USING ERRCODE = '22007';
  END IF;

  UPDATE public.pay_policies
     SET effective_to = _effective_from - 1,
         updated_by = v_actor
   WHERE id = v_cur.id;

  INSERT INTO public.pay_policies (
    company_id, name, description, is_company_default, is_active,
    linehaul_pct, fsc_pct, detention_pct, layover_pct, tonu_pct, stopoff_pct,
    lumper_reimbursement_pct, per_ton_pct, loadout_pct, other_accessorial_pct,
    charge_pay_classes, fuel_discount_passthrough,
    effective_date, effective_from, effective_to, created_by, updated_by
  ) VALUES (
    v_cur.company_id,
    COALESCE(_name, v_cur.name),
    COALESCE(_description, v_cur.description),
    true,
    true,
    COALESCE((_rates->>'linehaul_pct')::numeric,             v_cur.linehaul_pct),
    COALESCE((_rates->>'fsc_pct')::numeric,                  v_cur.fsc_pct),
    COALESCE((_rates->>'detention_pct')::numeric,            v_cur.detention_pct),
    COALESCE((_rates->>'layover_pct')::numeric,              v_cur.layover_pct),
    COALESCE((_rates->>'tonu_pct')::numeric,                 v_cur.tonu_pct),
    COALESCE((_rates->>'stopoff_pct')::numeric,              v_cur.stopoff_pct),
    COALESCE((_rates->>'lumper_reimbursement_pct')::numeric, v_cur.lumper_reimbursement_pct),
    COALESCE((_rates->>'per_ton_pct')::numeric,              v_cur.per_ton_pct),
    COALESCE((_rates->>'loadout_pct')::numeric,              v_cur.loadout_pct),
    COALESCE((_rates->>'other_accessorial_pct')::numeric,    v_cur.other_accessorial_pct),
    v_cur.charge_pay_classes,
    v_cur.fuel_discount_passthrough,
    _effective_from,
    _effective_from,
    NULL,
    v_actor,
    v_actor
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$function$;

COMMENT ON FUNCTION public.open_pay_policy_version(date, jsonb, text, text) IS
  'Owner only (pay_policy.change). Closes the current company pay policy version the day before _effective_from and opens a new one inheriting every rate not named in _rates. The only writer that creates a pay policy version. Attribution via current_profile_id(), matching the created_by/updated_by foreign keys.';

REVOKE ALL ON FUNCTION public.open_pay_policy_version(date, jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_pay_policy_version(date, jsonb, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.open_pay_policy_version(date, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_pay_policy_version(date, jsonb, text, text) TO service_role;