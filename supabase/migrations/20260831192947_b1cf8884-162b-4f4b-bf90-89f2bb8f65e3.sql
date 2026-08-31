-- Recompute a load's total value from its header rates plus its charges.
-- Mirrors the arithmetic already inside update_load_with_stops so the two
-- writers can never disagree about what a load is worth.
CREATE OR REPLACE FUNCTION public.recompute_load_total_value(p_load_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_load public.loads;
  v_charge_sum numeric := 0;
  v_base numeric := 0;
  v_total numeric := 0;
BEGIN
  SELECT * INTO v_load FROM public.loads WHERE id = p_load_id;
  IF v_load.id IS NULL THEN
    RAISE EXCEPTION 'Load not found';
  END IF;

  SELECT coalesce(sum(amount), 0) INTO v_charge_sum
    FROM public.load_charges WHERE load_id = p_load_id;

  IF v_load.load_type = 'loadout' THEN
    v_total := coalesce(v_load.loadout_relocation_fee, 0);
  ELSE
    v_base := CASE v_load.rate_type::text
      WHEN 'per_mile' THEN coalesce(v_load.rate_per_mile, 0) * coalesce(v_load.loaded_miles, 0)
      WHEN 'per_ton'  THEN coalesce(v_load.rate_per_ton, 0) * coalesce(v_load.estimated_tons, 0)
      ELSE coalesce(v_load.linehaul_rate, 0)
    END;
    v_total := v_base
      + CASE WHEN coalesce(v_load.fsc_bundled_into_linehaul, true)
             THEN 0 ELSE coalesce(v_load.fsc_amount, 0) END
      + v_charge_sum;
  END IF;

  v_total := round(v_total, 2);

  IF v_load.total_load_value IS DISTINCT FROM v_total THEN
    INSERT INTO public.load_change_history (
      load_id, field_path, previous_value, new_value, is_financial, reason, changed_by
    ) VALUES (
      p_load_id, 'total_load_value', v_load.total_load_value::text, v_total::text,
      true, 'Recomputed after a charge change', public.current_profile_id()
    );
    UPDATE public.loads
       SET total_load_value = v_total, updated_at = now(),
           updated_by = public.current_profile_id()
     WHERE id = p_load_id;
  END IF;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_load_total_value(uuid) FROM PUBLIC, anon, authenticated;

-- Shared gate: who may touch charges, and on which loads.
CREATE OR REPLACE FUNCTION public.assert_charge_entry_allowed(p_load_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (
    public.has_role(v_uid, 'management')
    OR public.has_role(v_uid, 'owner')
    OR public.has_role(v_uid, 'dispatcher')
  ) THEN
    RAISE EXCEPTION 'You do not have permission to change charges on a load';
  END IF;

  SELECT status::text INTO v_status FROM public.loads WHERE id = p_load_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Load not found';
  END IF;
  IF v_status IN ('invoiced','factored','paid','settled','closed') THEN
    RAISE EXCEPTION 'This load''s money is fixed (%). A late accessorial must go through the adjustment path, referencing this load, and land in a later settlement.', v_status;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_charge_entry_allowed(uuid) FROM PUBLIC, anon, authenticated;

-- The nine charge types the pay policy knows. No new types are introduced here.
CREATE OR REPLACE FUNCTION public.assert_known_charge_type(p_type text)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF p_type IS NULL OR p_type NOT IN (
    'linehaul','fsc','detention','stopoff','lumper','layover','tonu','reimbursement','other'
  ) THEN
    RAISE EXCEPTION 'Unknown charge type: %', coalesce(p_type, '(null)');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_known_charge_type(text) FROM PUBLIC, anon, authenticated;

-- ADD -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_load_charge(
  p_load_id uuid,
  p_charge_type text,
  p_amount numeric,
  p_reason text,
  p_description text DEFAULT NULL,
  p_funding_source text DEFAULT NULL,
  p_actual_cost numeric DEFAULT NULL,
  p_proof_document_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_profile uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_id uuid;
BEGIN
  PERFORM public.assert_charge_entry_allowed(p_load_id);
  PERFORM public.assert_known_charge_type(p_charge_type);

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A reason is required when a change affects the value of the load';
  END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'A charge needs an amount of zero or more';
  END IF;

  v_profile := public.current_profile_id();

  INSERT INTO public.load_charges (
    load_id, charge_type, description, amount, source, created_by, updated_by,
    funding_source, actual_cost, proof_document_id
  ) VALUES (
    p_load_id, p_charge_type, nullif(btrim(coalesce(p_description,'')), ''),
    p_amount, 'manual', v_profile, v_profile,
    nullif(p_funding_source, ''), p_actual_cost, p_proof_document_id
  )
  RETURNING id INTO v_id;

  INSERT INTO public.load_change_history (
    load_id, field_path, previous_value, new_value, is_financial, reason, changed_by
  ) VALUES (
    p_load_id, 'charge_added', NULL,
    p_charge_type || ': ' || to_char(p_amount, 'FM999999990.00')
      || coalesce(' — ' || nullif(btrim(coalesce(p_description,'')), ''), ''),
    true, v_reason, v_profile
  );

  PERFORM public.recompute_load_total_value(p_load_id);
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_load_charge(uuid, text, numeric, text, text, text, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_load_charge(uuid, text, numeric, text, text, text, numeric, uuid) TO authenticated;

-- EDIT ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_load_charge(
  p_charge_id uuid,
  p_charge_type text,
  p_amount numeric,
  p_reason text,
  p_description text DEFAULT NULL,
  p_funding_source text DEFAULT NULL,
  p_actual_cost numeric DEFAULT NULL,
  p_proof_document_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_profile uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_old public.load_charges;
  v_new public.load_charges;
  v_key text;
  v_a text;
  v_b text;
BEGIN
  SELECT * INTO v_old FROM public.load_charges WHERE id = p_charge_id;
  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Charge not found';
  END IF;

  PERFORM public.assert_charge_entry_allowed(v_old.load_id);
  PERFORM public.assert_known_charge_type(p_charge_type);

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A reason is required when a change affects the value of the load';
  END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'A charge needs an amount of zero or more';
  END IF;

  v_profile := public.current_profile_id();

  UPDATE public.load_charges SET
    charge_type = p_charge_type,
    description = nullif(btrim(coalesce(p_description,'')), ''),
    amount = p_amount,
    funding_source = nullif(p_funding_source, ''),
    actual_cost = p_actual_cost,
    proof_document_id = p_proof_document_id,
    updated_by = v_profile,
    updated_at = now()
  WHERE id = p_charge_id
  RETURNING * INTO v_new;

  FOREACH v_key IN ARRAY ARRAY['charge_type','description','amount','funding_source',
                               'actual_cost','proof_document_id'] LOOP
    v_a := to_jsonb(v_old)->>v_key;
    v_b := to_jsonb(v_new)->>v_key;
    IF v_key IN ('amount','actual_cost') THEN
      CONTINUE WHEN nullif(v_a,'')::numeric IS NOT DISTINCT FROM nullif(v_b,'')::numeric;
    ELSE
      CONTINUE WHEN v_a IS NOT DISTINCT FROM v_b;
    END IF;
    INSERT INTO public.load_change_history (
      load_id, field_path, previous_value, new_value, is_financial, reason, changed_by
    ) VALUES (
      v_old.load_id, 'charge · ' || v_key, v_a, v_b,
      v_key IN ('amount','charge_type','actual_cost','funding_source'), v_reason, v_profile
    );
  END LOOP;

  PERFORM public.recompute_load_total_value(v_old.load_id);
  RETURN p_charge_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_load_charge(uuid, text, numeric, text, text, text, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_load_charge(uuid, text, numeric, text, text, text, numeric, uuid) TO authenticated;

-- REMOVE --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_load_charge(
  p_charge_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_profile uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_old public.load_charges;
BEGIN
  SELECT * INTO v_old FROM public.load_charges WHERE id = p_charge_id;
  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Charge not found';
  END IF;

  PERFORM public.assert_charge_entry_allowed(v_old.load_id);

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A reason is required when a change affects the value of the load';
  END IF;

  v_profile := public.current_profile_id();

  DELETE FROM public.load_charges WHERE id = p_charge_id;

  INSERT INTO public.load_change_history (
    load_id, field_path, previous_value, new_value, is_financial, reason, changed_by
  ) VALUES (
    v_old.load_id, 'charge_removed',
    v_old.charge_type || ': ' || to_char(v_old.amount, 'FM999999990.00')
      || coalesce(' — ' || v_old.description, ''),
    NULL, true, v_reason, v_profile
  );

  PERFORM public.recompute_load_total_value(v_old.load_id);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_load_charge(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_load_charge(uuid, text) TO authenticated;