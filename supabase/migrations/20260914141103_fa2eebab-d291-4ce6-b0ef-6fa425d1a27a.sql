CREATE OR REPLACE FUNCTION public.update_load_charge(p_charge_id uuid, p_charge_type text, p_amount numeric, p_reason text, p_description text DEFAULT NULL::text, p_funding_source text DEFAULT NULL::text, p_actual_cost numeric DEFAULT NULL::numeric, p_proof_document_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_profile uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_load uuid;
  v_old public.load_charges;
  v_new public.load_charges;
  v_key text;
  v_a text;
  v_b text;
BEGIN
  -- AUTHORISATION FIRST. The gate used to sit after the charge lookup, which
  -- (a) told an unauthorised caller 'Charge not found' — a claim about the DATA
  -- when the truth is permission — and (b) made the function read as ungated.
  -- The lookup here takes the load id only. A made-up charge id yields NULL and
  -- the gate still refuses a non-staff caller on its role test, which precedes
  -- its own load lookup.
  SELECT load_id INTO v_load FROM public.load_charges WHERE id = p_charge_id;
  PERFORM public.assert_charge_entry_allowed(v_load);
  PERFORM public.assert_known_charge_type(p_charge_type);

  SELECT * INTO v_old FROM public.load_charges WHERE id = p_charge_id;
  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Charge not found';
  END IF;

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
$function$;

REVOKE ALL ON FUNCTION public.update_load_charge(uuid, text, numeric, text, text, text, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_load_charge(uuid, text, numeric, text, text, text, numeric, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delete_load_charge(p_charge_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_profile uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_load uuid;
  v_old public.load_charges;
BEGIN
  -- AUTHORISATION FIRST — see update_load_charge for the reasoning.
  SELECT load_id INTO v_load FROM public.load_charges WHERE id = p_charge_id;
  PERFORM public.assert_charge_entry_allowed(v_load);

  SELECT * INTO v_old FROM public.load_charges WHERE id = p_charge_id;
  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Charge not found';
  END IF;

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
$function$;

REVOKE ALL ON FUNCTION public.delete_load_charge(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_load_charge(uuid, text) TO authenticated, service_role;