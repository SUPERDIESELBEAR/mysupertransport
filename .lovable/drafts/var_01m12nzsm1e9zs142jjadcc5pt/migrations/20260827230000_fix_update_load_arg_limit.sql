-- Fix: update_load_with_stops built its change-history snapshot with a single
-- jsonb_build_object() call. The six detention-terms keys pushed it to 106
-- arguments, past Postgres's hard 100-argument limit, so every load edit failed
-- with SQLSTATE 54023 "cannot pass more than 100 arguments to a function".
-- The snapshot is now built in two calls concatenated with ||. The resulting
-- jsonb object is identical; no behavior change.

CREATE OR REPLACE FUNCTION public.update_load_with_stops(p_load_id uuid, p_load jsonb, p_stops jsonb, p_charges jsonb DEFAULT '[]'::jsonb, p_reason text DEFAULT NULL::text, p_financial_unlock_reason text DEFAULT NULL::text, p_ack_stop_data_loss boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_profile uuid;
  v_is_owner boolean;
  v_is_mgmt boolean;
  v_is_disp boolean;
  v_load public.loads;
  v_locked boolean;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_unlock text := nullif(btrim(coalesce(p_financial_unlock_reason, '')), '');
  v_count int;
  v_idx int := 0;
  v_stop jsonb;
  v_charge jsonb;
  v_stop_id uuid;
  v_stop_ids uuid[] := '{}';
  v_kept uuid[] := '{}';
  v_old_stop public.load_stops;
  v_middle boolean;
  v_stop_index int;
  v_old jsonb;
  v_new jsonb;
  v_key text;
  v_a text;
  v_b text;
  v_financial boolean := false;
  v_changes jsonb := '[]'::jsonb;
  v_base numeric := 0;
  v_total numeric := 0;
  v_charge_sum numeric := 0;
  v_old_charges numeric;
  v_doomed record;
  v_num_keys text[] := ARRAY[
    'weight_lbs','linehaul_rate','rate_per_mile','rate_per_ton','estimated_tons','fsc_amount',
    'loaded_miles','deadhead_miles','reefer_temp_f','reefer_temp_min_f','reefer_temp_max_f',
    'permit_cost','loadout_relocation_fee','loadout_use_period_days','stopoff_charge_amount','amount',
    'detention_free_time_minutes','detention_rate_per_hour','detention_daily_cap'
  ];
  v_fin_keys text[] := ARRAY[
    'rate_type','linehaul_rate','rate_per_mile','rate_per_ton','estimated_tons',
    'fsc_bundled_into_linehaul','fsc_amount','loadout_relocation_fee','permit_cost',
    'permit_recovery_method','loaded_miles'
  ];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_is_owner := public.has_role(v_uid, 'owner');
  v_is_mgmt  := public.has_role(v_uid, 'management') OR v_is_owner;
  v_is_disp  := public.has_role(v_uid, 'dispatcher');

  IF NOT (v_is_mgmt OR v_is_disp) THEN
    RAISE EXCEPTION 'You do not have permission to edit loads';
  END IF;

  v_profile := public.current_profile_id();

  SELECT * INTO v_load FROM public.loads WHERE id = p_load_id;
  IF v_load.id IS NULL THEN
    RAISE EXCEPTION 'Load not found';
  END IF;

  IF nullif(p_load->>'load_number','') IS NOT NULL
     AND (p_load->>'load_number') <> v_load.load_number THEN
    RAISE EXCEPTION 'The load number cannot be changed';
  END IF;

  v_locked := v_load.status IN ('invoiced','factored','paid','settled','closed');

  v_count := jsonb_array_length(p_stops);
  IF v_count < 2 THEN
    RAISE EXCEPTION 'A load requires at least two stops';
  END IF;

  v_old := jsonb_build_object(
    'load_type', v_load.load_type::text,
    'broker_id', v_load.broker_id::text,
    'broker_reference_number', v_load.broker_reference_number,
    'equipment_type', v_load.equipment_type::text,
    'handling_type', v_load.handling_type::text,
    'commodity', v_load.commodity,
    'weight_lbs', v_load.weight_lbs::text,
    'bol_number', v_load.bol_number,
    'po_number', v_load.po_number,
    'rate_type', v_load.rate_type::text,
    'linehaul_rate', v_load.linehaul_rate::text,
    'rate_per_mile', v_load.rate_per_mile::text,
    'rate_per_ton', v_load.rate_per_ton::text,
    'estimated_tons', v_load.estimated_tons::text,
    'fsc_bundled_into_linehaul', v_load.fsc_bundled_into_linehaul::text,
    'fsc_amount', v_load.fsc_amount::text,
    'loaded_miles', v_load.loaded_miles::text,
    'deadhead_miles', v_load.deadhead_miles::text,
    'reefer_temp_f', v_load.reefer_temp_f::text,
    'reefer_temp_min_f', v_load.reefer_temp_min_f::text,
    'reefer_temp_max_f', v_load.reefer_temp_max_f::text,
    'reefer_precool_required', v_load.reefer_precool_required::text,
    'reefer_continuous_run', v_load.reefer_continuous_run::text,
    'reefer_notes', v_load.reefer_notes,
    'loadout_trailer_owner_company', v_load.loadout_trailer_owner_company,
    'loadout_trailer_owner_contact', v_load.loadout_trailer_owner_contact,
    'loadout_trailer_number', v_load.loadout_trailer_number,
    'loadout_trailer_vin', v_load.loadout_trailer_vin,
    'loadout_trailer_type', v_load.loadout_trailer_type,
    'loadout_relocation_fee', v_load.loadout_relocation_fee::text,
    'loadout_use_period_days', v_load.loadout_use_period_days::text,
    'loadout_use_start', v_load.loadout_use_start::text,
    'loadout_use_end', v_load.loadout_use_end::text,
    'loadout_use_window_source', v_load.loadout_use_window_source,
  );
  v_old := v_old || jsonb_build_object(
    'detention_free_time_minutes', v_load.detention_free_time_minutes::text,
    'detention_rate_per_hour', v_load.detention_rate_per_hour::text,
    'detention_daily_cap', v_load.detention_daily_cap::text,
    'detention_clock_start', v_load.detention_clock_start::text,
    'detention_notification_required', v_load.detention_notification_required::text,
    'detention_terms_note', v_load.detention_terms_note,
    'internal_notes', v_load.internal_notes,
    'driver_facing_notes', v_load.driver_facing_notes,
    'special_instructions', v_load.special_instructions,
    'special_instructions_verbatim', v_load.special_instructions_verbatim,
    'broker_terms_verbatim', v_load.broker_terms_verbatim,
    'mode', v_load.mode,
    'is_team_load', v_load.is_team_load::text,
    'co_driver_name', v_load.co_driver_name,
    'is_hazmat', v_load.is_hazmat::text,
    'permit_required', v_load.permit_required::text,
    'permit_cost', v_load.permit_cost::text,
    'permit_recovery_method', v_load.permit_recovery_method
  );

  v_new := '{}'::jsonb;
  FOR v_key IN SELECT jsonb_object_keys(v_old) LOOP
    v_new := v_new || jsonb_build_object(v_key, nullif(p_load->>v_key, ''));
  END LOOP;
  FOREACH v_key IN ARRAY ARRAY['fsc_bundled_into_linehaul','reefer_precool_required',
                               'reefer_continuous_run','is_team_load','is_hazmat','permit_required'] LOOP
    v_new := v_new || jsonb_build_object(
      v_key, coalesce((p_load->>v_key)::boolean, false)::text);
  END LOOP;

  FOR v_key IN SELECT jsonb_object_keys(v_old) LOOP
    v_a := v_old->>v_key;
    v_b := v_new->>v_key;
    IF v_key = ANY(v_num_keys) THEN
      IF nullif(v_a,'')::numeric IS DISTINCT FROM nullif(v_b,'')::numeric THEN
        IF v_key = ANY(v_fin_keys) THEN v_financial := true; END IF;
        v_changes := v_changes || jsonb_build_array(
          jsonb_build_object('f', v_key, 'a', v_a, 'b', v_b,
                             'fin', v_key = ANY(v_fin_keys)));
      END IF;
    ELSIF v_a IS DISTINCT FROM v_b THEN
      IF v_key = ANY(v_fin_keys) THEN v_financial := true; END IF;
      v_changes := v_changes || jsonb_build_array(
        jsonb_build_object('f', v_key, 'a', v_a, 'b', v_b,
                           'fin', v_key = ANY(v_fin_keys)));
    END IF;
  END LOOP;

  SELECT coalesce(sum(amount), 0) INTO v_old_charges
    FROM public.load_charges WHERE load_id = p_load_id;

  SELECT coalesce(sum(coalesce(nullif(c->>'amount','')::numeric, 0)), 0)
    INTO v_charge_sum
    FROM jsonb_array_elements(coalesce(p_charges, '[]'::jsonb)) c;

  IF v_old_charges IS DISTINCT FROM v_charge_sum THEN
    v_financial := true;
    v_changes := v_changes || jsonb_build_array(
      jsonb_build_object('f', 'charges_total', 'a', v_old_charges::text,
                         'b', v_charge_sum::text, 'fin', true));
  END IF;

  IF v_financial AND v_locked THEN
    IF NOT v_is_owner THEN
      RAISE EXCEPTION 'This load has been billed. Only the owner can change its financial fields.';
    END IF;
    IF v_unlock IS NULL THEN
      RAISE EXCEPTION 'A written reason is required to unlock financial fields on a billed load';
    END IF;
    INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
    VALUES (v_uid, public._audit_actor_name(v_uid), 'load_financial_unlock', 'load', p_load_id,
            v_load.load_number,
            jsonb_build_object('reason', v_unlock, 'status', v_load.status::text,
                               'actor_profile_id', v_profile));
  END IF;

  IF v_financial AND v_reason IS NULL THEN
    RAISE EXCEPTION 'A reason is required when a change affects the value of the load';
  END IF;

  FOR v_stop IN SELECT * FROM jsonb_array_elements(p_stops) LOOP
    IF nullif(v_stop->>'id','') IS NOT NULL THEN
      v_kept := array_append(v_kept, (v_stop->>'id')::uuid);
    END IF;
  END LOOP;

  FOR v_doomed IN
    SELECT * FROM public.load_stops
     WHERE load_id = p_load_id
       AND NOT (id = ANY(v_kept))
  LOOP
    IF (v_doomed.actual_arrival_at IS NOT NULL
        OR v_doomed.actual_departure_at IS NOT NULL
        OR v_doomed.arrival_latitude IS NOT NULL
        OR v_doomed.departure_latitude IS NOT NULL)
       AND NOT coalesce(p_ack_stop_data_loss, false) THEN
      RAISE EXCEPTION 'Stop % has driver check-in data. Removing it deletes that record; confirm before saving.',
        v_doomed.stop_sequence;
    END IF;

    INSERT INTO public.load_change_history (
      load_id, field_path, previous_value, new_value, is_financial, reason, changed_by
    ) VALUES (
      p_load_id,
      'stop_removed',
      'Stop ' || v_doomed.stop_sequence || ': ' ||
        coalesce(v_doomed.facility_name, coalesce(v_doomed.city,'') || ' ' || coalesce(v_doomed.state,'')),
      NULL, false, v_reason, v_profile
    );

    UPDATE public.load_charges SET load_stop_id = NULL WHERE load_stop_id = v_doomed.id;
    DELETE FROM public.load_stops WHERE id = v_doomed.id;
  END LOOP;

  UPDATE public.load_stops
     SET stop_sequence = -stop_sequence
   WHERE load_id = p_load_id AND stop_sequence > 0;

  v_idx := 0;
  FOR v_stop IN SELECT * FROM jsonb_array_elements(p_stops) LOOP
    v_idx := v_idx + 1;
    v_middle := (v_idx > 1 AND v_idx < v_count);

    IF nullif(v_stop->>'id','') IS NOT NULL THEN
      SELECT * INTO v_old_stop FROM public.load_stops WHERE id = (v_stop->>'id')::uuid AND load_id = p_load_id;
      IF v_old_stop.id IS NULL THEN
        RAISE EXCEPTION 'A stop being edited no longer exists on this load';
      END IF;

      UPDATE public.load_stops SET
        stop_sequence = v_idx,
        stop_type = COALESCE(NULLIF(v_stop->>'stop_type','')::stop_type, stop_type),
        facility_id = NULLIF(v_stop->>'facility_id','')::uuid,
        facility_name = NULLIF(v_stop->>'facility_name',''),
        address_line1 = NULLIF(v_stop->>'address_line1',''),
        address_line2 = NULLIF(v_stop->>'address_line2',''),
        city = NULLIF(v_stop->>'city',''),
        state = NULLIF(v_stop->>'state',''),
        zip = NULLIF(v_stop->>'zip',''),
        contact_name = NULLIF(v_stop->>'contact_name',''),
        contact_phone = NULLIF(v_stop->>'contact_phone',''),
        appointment_start = NULLIF(v_stop->>'appointment_start','')::timestamptz,
        appointment_end = NULLIF(v_stop->>'appointment_end','')::timestamptz,
        reference_number = NULLIF(v_stop->>'reference_number',''),
        reference_label = NULLIF(v_stop->>'reference_label',''),
        stopoff_charge_eligible = v_middle,
        stopoff_charge_amount = CASE WHEN v_middle
          THEN NULLIF(v_stop->>'stopoff_charge_amount','')::numeric ELSE NULL END,
        stop_notes = NULLIF(v_stop->>'stop_notes',''),
        stop_notes_verbatim = NULLIF(v_stop->>'stop_notes_verbatim',''),
        updated_at = now()
      WHERE id = v_old_stop.id;

      v_stop_id := v_old_stop.id;

      FOREACH v_key IN ARRAY ARRAY['stop_type','facility_name','address_line1','address_line2',
                                   'city','state','zip','contact_name','contact_phone',
                                   'appointment_start','appointment_end','reference_number',
                                   'reference_label','stopoff_charge_amount','stop_notes',
                                   'stop_notes_verbatim'] LOOP
        SELECT (to_jsonb(v_old_stop)->>v_key) INTO v_a;
        SELECT (to_jsonb(s)->>v_key) INTO v_b FROM public.load_stops s WHERE s.id = v_stop_id;
        IF v_key = ANY(v_num_keys) THEN
          CONTINUE WHEN nullif(v_a,'')::numeric IS NOT DISTINCT FROM nullif(v_b,'')::numeric;
        ELSIF v_key IN ('appointment_start','appointment_end') THEN
          CONTINUE WHEN nullif(v_a,'')::timestamptz IS NOT DISTINCT FROM nullif(v_b,'')::timestamptz;
        ELSE
          CONTINUE WHEN v_a IS NOT DISTINCT FROM v_b;
        END IF;
        INSERT INTO public.load_change_history (
          load_id, field_path, previous_value, new_value, is_financial, reason, changed_by
        ) VALUES (
          p_load_id, 'stop ' || v_idx || ' · ' || v_key, v_a, v_b,
          v_key = 'stopoff_charge_amount', v_reason, v_profile
        );
      END LOOP;

      IF v_old_stop.stop_sequence <> -v_idx THEN
        INSERT INTO public.load_change_history (
          load_id, field_path, previous_value, new_value, is_financial, reason, changed_by
        ) VALUES (p_load_id, 'stop order', 'position ' || abs(v_old_stop.stop_sequence),
                  'position ' || v_idx, false, v_reason, v_profile);
      END IF;
    ELSE
      INSERT INTO public.load_stops (
        load_id, stop_sequence, stop_type, facility_id, facility_name, address_line1, address_line2,
        city, state, zip, contact_name, contact_phone, appointment_start, appointment_end,
        stopoff_charge_eligible, stopoff_charge_amount, reference_number, reference_label, stop_notes, stop_notes_verbatim
      ) VALUES (
        p_load_id, v_idx,
        COALESCE(NULLIF(v_stop->>'stop_type','')::stop_type, 'pickup'),
        NULLIF(v_stop->>'facility_id','')::uuid,
        NULLIF(v_stop->>'facility_name',''),
        NULLIF(v_stop->>'address_line1',''),
        NULLIF(v_stop->>'address_line2',''),
        NULLIF(v_stop->>'city',''),
        NULLIF(v_stop->>'state',''),
        NULLIF(v_stop->>'zip',''),
        NULLIF(v_stop->>'contact_name',''),
        NULLIF(v_stop->>'contact_phone',''),
        NULLIF(v_stop->>'appointment_start','')::timestamptz,
        NULLIF(v_stop->>'appointment_end','')::timestamptz,
        v_middle,
        CASE WHEN v_middle THEN NULLIF(v_stop->>'stopoff_charge_amount','')::numeric ELSE NULL END,
        NULLIF(v_stop->>'reference_number',''),
        NULLIF(v_stop->>'reference_label',''),
        NULLIF(v_stop->>'stop_notes',''),
        NULLIF(v_stop->>'stop_notes_verbatim','')
      ) RETURNING id INTO v_stop_id;

      INSERT INTO public.load_change_history (
        load_id, field_path, previous_value, new_value, is_financial, reason, changed_by
      ) VALUES (
        p_load_id, 'stop_added', NULL,
        'Stop ' || v_idx || ': ' || coalesce(NULLIF(v_stop->>'facility_name',''),
          coalesce(v_stop->>'city','') || ' ' || coalesce(v_stop->>'state','')),
        false, v_reason, v_profile
      );
    END IF;

    v_stop_ids := array_append(v_stop_ids, v_stop_id);
  END LOOP;

  DELETE FROM public.load_charges WHERE load_id = p_load_id;

  IF p_charges IS NOT NULL AND jsonb_typeof(p_charges) = 'array' THEN
    FOR v_charge IN SELECT * FROM jsonb_array_elements(p_charges) LOOP
      v_stop_index := NULLIF(v_charge->>'stop_index','')::int;
      INSERT INTO public.load_charges (
        load_id, load_stop_id, charge_type, description, amount, source, created_by, updated_by,
        funding_source, actual_cost, proof_document_id
      ) VALUES (
        p_load_id,
        CASE
          WHEN v_stop_index IS NOT NULL
               AND v_stop_index >= 0
               AND v_stop_index < array_length(v_stop_ids, 1)
          THEN v_stop_ids[v_stop_index + 1]
          ELSE NULL
        END,
        COALESCE(NULLIF(v_charge->>'charge_type',''), 'other'),
        NULLIF(v_charge->>'description',''),
        COALESCE(NULLIF(v_charge->>'amount','')::numeric, 0),
        COALESCE(NULLIF(v_charge->>'source',''), 'manual'),
        v_profile, v_profile,
        NULLIF(v_charge->>'funding_source','')::text,
        NULLIF(v_charge->>'actual_cost','')::numeric,
        NULLIF(v_charge->>'proof_document_id','')::uuid
      );
    END LOOP;
  END IF;

  SELECT coalesce(sum(amount), 0) INTO v_charge_sum
    FROM public.load_charges WHERE load_id = p_load_id;

  IF (v_new->>'load_type') = 'loadout' THEN
    v_total := coalesce(nullif(v_new->>'loadout_relocation_fee','')::numeric, 0);
  ELSE
    v_base := CASE (v_new->>'rate_type')
      WHEN 'per_mile' THEN coalesce(nullif(v_new->>'rate_per_mile','')::numeric, 0)
                           * coalesce(nullif(v_new->>'loaded_miles','')::numeric, 0)
      WHEN 'per_ton'  THEN coalesce(nullif(v_new->>'rate_per_ton','')::numeric, 0)
                           * coalesce(nullif(v_new->>'estimated_tons','')::numeric, 0)
      ELSE coalesce(nullif(v_new->>'linehaul_rate','')::numeric, 0)
    END;
    v_total := v_base
      + CASE WHEN (v_new->>'fsc_bundled_into_linehaul')::boolean
             THEN 0 ELSE coalesce(nullif(v_new->>'fsc_amount','')::numeric, 0) END
      + v_charge_sum;
  END IF;
  v_total := round(v_total, 2);

  IF v_load.total_load_value IS DISTINCT FROM v_total THEN
    v_changes := v_changes || jsonb_build_array(
      jsonb_build_object('f','total_load_value','a', v_load.total_load_value::text,
                         'b', v_total::text, 'fin', true));
  END IF;

  UPDATE public.loads SET
    load_type = COALESCE(NULLIF(v_new->>'load_type','')::load_type, load_type),
    broker_id = NULLIF(v_new->>'broker_id','')::uuid,
    broker_reference_number = v_new->>'broker_reference_number',
    equipment_type = COALESCE(NULLIF(v_new->>'equipment_type','')::equipment_type, equipment_type),
    handling_type = COALESCE(NULLIF(v_new->>'handling_type','')::load_handling_type, handling_type),
    commodity = v_new->>'commodity',
    weight_lbs = nullif(v_new->>'weight_lbs','')::numeric,
    bol_number = v_new->>'bol_number',
    po_number = v_new->>'po_number',
    rate_type = COALESCE(NULLIF(v_new->>'rate_type','')::rate_type, rate_type),
    linehaul_rate = nullif(v_new->>'linehaul_rate','')::numeric,
    rate_per_mile = nullif(v_new->>'rate_per_mile','')::numeric,
    rate_per_ton = nullif(v_new->>'rate_per_ton','')::numeric,
    estimated_tons = nullif(v_new->>'estimated_tons','')::numeric,
    fsc_bundled_into_linehaul = (v_new->>'fsc_bundled_into_linehaul')::boolean,
    fsc_amount = nullif(v_new->>'fsc_amount','')::numeric,
    loaded_miles = nullif(v_new->>'loaded_miles','')::numeric,
    deadhead_miles = nullif(v_new->>'deadhead_miles','')::numeric,
    total_load_value = v_total,
    reefer_temp_f = nullif(v_new->>'reefer_temp_f','')::numeric,
    reefer_temp_min_f = nullif(v_new->>'reefer_temp_min_f','')::numeric,
    reefer_temp_max_f = nullif(v_new->>'reefer_temp_max_f','')::numeric,
    reefer_precool_required = (v_new->>'reefer_precool_required')::boolean,
    reefer_continuous_run = (v_new->>'reefer_continuous_run')::boolean,
    reefer_notes = v_new->>'reefer_notes',
    loadout_trailer_owner_company = v_new->>'loadout_trailer_owner_company',
    loadout_trailer_owner_contact = v_new->>'loadout_trailer_owner_contact',
    loadout_trailer_number = v_new->>'loadout_trailer_number',
    loadout_trailer_vin = v_new->>'loadout_trailer_vin',
    loadout_trailer_type = v_new->>'loadout_trailer_type',
    loadout_relocation_fee = nullif(v_new->>'loadout_relocation_fee','')::numeric,
    loadout_use_period_days = nullif(v_new->>'loadout_use_period_days','')::int,
    loadout_use_start = nullif(v_new->>'loadout_use_start','')::date,
    loadout_use_end = nullif(v_new->>'loadout_use_end','')::date,
    loadout_use_window_source = nullif(v_new->>'loadout_use_window_source',''),
    detention_free_time_minutes = nullif(v_new->>'detention_free_time_minutes','')::int,
    detention_rate_per_hour = nullif(v_new->>'detention_rate_per_hour','')::numeric,
    detention_daily_cap = nullif(v_new->>'detention_daily_cap','')::numeric,
    detention_clock_start = nullif(v_new->>'detention_clock_start','')::detention_clock_start,
    detention_notification_required = nullif(v_new->>'detention_notification_required','')::boolean,
    detention_terms_note = v_new->>'detention_terms_note',
    internal_notes = v_new->>'internal_notes',
    driver_facing_notes = v_new->>'driver_facing_notes',
    special_instructions = v_new->>'special_instructions',
    special_instructions_verbatim = v_new->>'special_instructions_verbatim',
    broker_terms_verbatim = v_new->>'broker_terms_verbatim',
    mode = v_new->>'mode',
    is_team_load = (v_new->>'is_team_load')::boolean,
    co_driver_name = v_new->>'co_driver_name',
    is_hazmat = (v_new->>'is_hazmat')::boolean,
    permit_required = (v_new->>'permit_required')::boolean,
    permit_cost = nullif(v_new->>'permit_cost','')::numeric,
    permit_recovery_method = v_new->>'permit_recovery_method',
    updated_by = v_profile,
    updated_at = now()
  WHERE id = p_load_id;

  INSERT INTO public.load_change_history (
    load_id, field_path, previous_value, new_value, is_financial, reason, changed_by
  )
  SELECT p_load_id, c->>'f', c->>'a', c->>'b', (c->>'fin')::boolean, v_reason, v_profile
    FROM jsonb_array_elements(v_changes) c;

  UPDATE public.facilities f
     SET times_used = f.times_used + 1, last_used_at = now()
   WHERE f.id IN (
     SELECT DISTINCT ls.facility_id FROM public.load_stops ls
      WHERE ls.load_id = p_load_id AND ls.facility_id IS NOT NULL
   );

  RETURN p_load_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_load_with_stops(uuid, jsonb, jsonb, jsonb, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_load_with_stops(uuid, jsonb, jsonb, jsonb, text, text, boolean) TO authenticated;
