-- Re-pin search_path to "public, extensions" on SECURITY DEFINER functions
-- still pinned to public alone (part 1 of 3).
-- Bodies are byte-identical to the live definitions (pg_get_functiondef).

CREATE OR REPLACE FUNCTION public.assign_load_driver(p_load_id uuid, p_operator_id uuid, p_override_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_mgmt boolean;
  v_is_disp boolean;
  v_reason text := nullif(btrim(coalesce(p_override_reason, '')), '');
  v_elig jsonb;
  v_block jsonb;
  v_warn jsonb;
  v_status load_status;
  v_auto boolean := false;
  v_setting boolean;
  v_hist_id uuid;
  v_msgs text;
  v_profile uuid := public.current_profile_id();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_is_mgmt := public.has_role(v_uid, 'management') OR public.has_role(v_uid, 'owner');
  v_is_disp := public.has_role(v_uid, 'dispatcher');

  IF NOT (v_is_mgmt OR v_is_disp) THEN
    RAISE EXCEPTION 'You do not have permission to assign drivers to loads';
  END IF;

  SELECT status INTO v_status FROM public.loads WHERE id = p_load_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Load not found';
  END IF;

  v_elig := public.check_driver_eligibility(p_operator_id);
  v_block := v_elig -> 'blocking';
  v_warn := v_elig -> 'warnings';

  IF jsonb_array_length(v_block) > 0 THEN
    SELECT string_agg(e ->> 'message', '; ') INTO v_msgs
      FROM jsonb_array_elements(v_block) e;

    IF v_reason IS NULL THEN
      RAISE EXCEPTION 'Driver is not eligible: %', v_msgs;
    END IF;

    IF NOT v_is_mgmt THEN
      RAISE EXCEPTION 'Management approval is required to override: %', v_msgs;
    END IF;
  END IF;

  SELECT (setting_value)::text = 'true' INTO v_setting
    FROM public.company_settings WHERE setting_key = 'auto_cover_on_assignment';
  v_setting := COALESCE(v_setting, true);

  UPDATE public.loads
     SET operator_id = p_operator_id,
         updated_by = v_profile
   WHERE id = p_load_id;

  IF v_setting AND v_status = 'available' THEN
    UPDATE public.loads SET status = 'covered' WHERE id = p_load_id;
    v_auto := true;

    SELECT id INTO v_hist_id
      FROM public.load_status_history
     WHERE load_id = p_load_id
     ORDER BY changed_at DESC, created_at DESC
     LIMIT 1;

    IF v_hist_id IS NOT NULL THEN
      UPDATE public.load_status_history
         SET change_source = 'auto_assignment',
             notes = 'Status advanced automatically on driver assignment.'
                     || COALESCE(' Override reason: ' || v_reason, ''),
             changed_by = COALESCE(changed_by, v_profile)
       WHERE id = v_hist_id;
    END IF;
  END IF;

  IF v_reason IS NOT NULL AND jsonb_array_length(v_block) > 0 THEN
    INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
    VALUES (
      v_uid,
      public._audit_actor_name(v_uid),
      'load_driver_assignment_override',
      'load',
      p_load_id,
      (SELECT load_number FROM public.loads WHERE id = p_load_id),
      jsonb_build_object(
        'operator_id', p_operator_id,
        'failed_checks', v_block,
        'override_reason', v_reason,
        'actor_profile_id', v_profile
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'auto_advanced', v_auto,
    'warnings', v_warn
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_driver_eligibility_bulk(p_operator_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_id uuid;
  v_out jsonb := '{}'::jsonb;
BEGIN
  IF p_operator_ids IS NULL THEN
    RETURN v_out;
  END IF;
  FOREACH v_id IN ARRAY p_operator_ids LOOP
    v_out := v_out || jsonb_build_object(v_id::text, public.check_driver_eligibility(v_id));
  END LOOP;
  RETURN v_out;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_driver_eligibility(p_operator_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'America/Chicago')::date;
  v_op record;
  v_block jsonb := '[]'::jsonb;
  v_warn jsonb := '[]'::jsonb;
  v_cdl date;
  v_med date;
  v_reg date;
  v_dot date;
  v_other text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (public.has_role(v_uid, 'dispatcher')
          OR public.has_role(v_uid, 'management')
          OR public.has_role(v_uid, 'owner')) THEN
    RAISE EXCEPTION 'You do not have permission to check driver eligibility';
  END IF;

  SELECT o.id, o.user_id, o.is_active, o.on_hold, o.on_hold_reason,
         o.excluded_from_dispatch, o.excluded_from_dispatch_reason,
         a.cdl_expiration, a.medical_cert_expiration
    INTO v_op
    FROM public.operators o
    LEFT JOIN public.applications a ON a.id = o.application_id
   WHERE o.id = p_operator_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver not found';
  END IF;

  SELECT d.expires_at INTO v_cdl
    FROM public.inspection_documents d
   WHERE d.scope = 'per_driver' AND d.driver_id = v_op.user_id AND d.name = 'CDL (Front)'
   ORDER BY d.expires_at DESC NULLS LAST LIMIT 1;
  v_cdl := COALESCE(v_cdl, v_op.cdl_expiration);

  SELECT d.expires_at INTO v_med
    FROM public.inspection_documents d
   WHERE d.scope = 'per_driver' AND d.driver_id = v_op.user_id AND d.name = 'Medical Certificate'
   ORDER BY d.expires_at DESC NULLS LAST LIMIT 1;
  v_med := COALESCE(v_med, v_op.medical_cert_expiration);

  SELECT d.expires_at INTO v_reg
    FROM public.inspection_documents d
   WHERE d.scope = 'per_driver' AND d.driver_id = v_op.user_id
     AND d.name = 'IRP Registration (cab card)'
   ORDER BY d.expires_at DESC NULLS LAST LIMIT 1;

  SELECT max(t.next_due_date) INTO v_dot
    FROM public.truck_dot_inspections t
   WHERE t.operator_id = p_operator_id;

  -- Status blocks
  IF v_op.is_active IS NOT TRUE THEN
    v_block := v_block || jsonb_build_object('code','inactive','message','Driver is not active');
  END IF;

  IF v_op.excluded_from_dispatch IS TRUE THEN
    v_block := v_block || jsonb_build_object(
      'code','excluded_from_dispatch',
      'message','Driver is excluded from dispatch'
        || COALESCE(' — ' || nullif(btrim(v_op.excluded_from_dispatch_reason), ''), ''));
  END IF;

  IF v_op.on_hold IS TRUE THEN
    v_block := v_block || jsonb_build_object(
      'code','on_hold',
      'message','Driver is on hold'
        || COALESCE(' — ' || nullif(btrim(v_op.on_hold_reason), ''), ''));
  END IF;

  -- Document blocks / warnings
  IF v_cdl IS NULL THEN
    v_warn := v_warn || jsonb_build_object('code','cdl_missing','message','No CDL expiration date on file');
  ELSIF v_cdl < v_today THEN
    v_block := v_block || jsonb_build_object('code','cdl_expired',
      'message','CDL expired on ' || to_char(v_cdl, 'FMMonth FMDD, YYYY'));
  ELSIF v_cdl <= v_today + 14 THEN
    v_warn := v_warn || jsonb_build_object('code','cdl_expiring',
      'message','CDL expires on ' || to_char(v_cdl, 'FMMonth FMDD, YYYY'));
  END IF;

  IF v_med IS NULL THEN
    v_warn := v_warn || jsonb_build_object('code','medical_missing','message','No medical card expiration date on file');
  ELSIF v_med < v_today THEN
    v_block := v_block || jsonb_build_object('code','medical_expired',
      'message','Medical card expired on ' || to_char(v_med, 'FMMonth FMDD, YYYY'));
  ELSIF v_med <= v_today + 14 THEN
    v_warn := v_warn || jsonb_build_object('code','medical_expiring',
      'message','Medical card expires on ' || to_char(v_med, 'FMMonth FMDD, YYYY'));
  END IF;

  IF v_dot IS NULL THEN
    v_warn := v_warn || jsonb_build_object('code','dot_missing','message','No annual DOT inspection on file');
  ELSIF v_dot < v_today THEN
    v_block := v_block || jsonb_build_object('code','dot_expired',
      'message','Annual DOT inspection expired on ' || to_char(v_dot, 'FMMonth FMDD, YYYY'));
  ELSIF v_dot <= v_today + 14 THEN
    v_warn := v_warn || jsonb_build_object('code','dot_expiring',
      'message','Annual DOT inspection is due ' || to_char(v_dot, 'FMMonth FMDD, YYYY'));
  END IF;

  IF v_reg IS NULL THEN
    v_warn := v_warn || jsonb_build_object('code','registration_missing','message','No truck registration expiration date on file');
  ELSIF v_reg < v_today THEN
    v_block := v_block || jsonb_build_object('code','registration_expired',
      'message','Truck registration expired on ' || to_char(v_reg, 'FMMonth FMDD, YYYY'));
  ELSIF v_reg <= v_today + 14 THEN
    v_warn := v_warn || jsonb_build_object('code','registration_expiring',
      'message','Truck registration expires on ' || to_char(v_reg, 'FMMonth FMDD, YYYY'));
  END IF;

  SELECT string_agg(l.load_number, ', ' ORDER BY l.load_number) INTO v_other
    FROM public.loads l
   WHERE l.operator_id = p_operator_id
     AND l.status IN ('available','covered','dispatched','in_transit','at_delivery');

  IF v_other IS NOT NULL THEN
    v_warn := v_warn || jsonb_build_object('code','active_load',
      'message','Driver is already assigned to ' || v_other);
  END IF;

  RETURN jsonb_build_object(
    'operator_id', p_operator_id,
    'eligible', jsonb_array_length(v_block) = 0,
    'blocking', v_block,
    'warnings', v_warn
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.clear_binder_pending_on_stage2_received()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid;
BEGIN
  IF OLD.form_2290 IS DISTINCT FROM NEW.form_2290 AND NEW.form_2290 = 'received' THEN
    SELECT user_id INTO v_uid FROM public.operators WHERE id = NEW.operator_id;
    IF v_uid IS NOT NULL THEN
      UPDATE public.inspection_documents
         SET pending_review = false
       WHERE scope = 'per_driver'
         AND driver_id = v_uid
         AND name = 'Form 2290'
         AND pending_review = true;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.company_documents_set_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  max_version integer;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) INTO max_version
  FROM public.company_documents
  WHERE document_name = NEW.document_name;

  NEW.version_number := max_version + 1;
  NEW.is_current_version := true;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.company_documents_supersede_prior()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  UPDATE public.company_documents
  SET is_current_version = false,
      superseded_by_id = NEW.id
  WHERE document_name = NEW.document_name
    AND id <> NEW.id
    AND is_current_version;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.company_settings_stamp_updated_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  NEW.updated_by := COALESCE(public.current_profile_id(), OLD.updated_by);
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_load_with_stops(p_load jsonb, p_stops jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_load_id uuid;
  v_count int;
  v_idx int := 0;
  v_stop jsonb;
  v_profile uuid;
  v_dispatcher uuid;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'dispatcher')
  ) THEN
    RAISE EXCEPTION 'Not authorized to create loads';
  END IF;

  v_profile := public.current_profile_id();

  v_count := jsonb_array_length(p_stops);
  IF v_count < 2 THEN
    RAISE EXCEPTION 'A load requires at least two stops';
  END IF;

  IF public.has_role(auth.uid(), 'dispatcher') THEN
    v_dispatcher := v_profile;
  END IF;

  INSERT INTO public.loads (
    load_number, load_type, status, broker_id, broker_reference_number,
    operator_id, dispatcher_id, equipment_type, handling_type, commodity, weight_lbs,
    bol_number, po_number, rate_type, linehaul_rate, fsc_amount, fsc_bundled_into_linehaul,
    rate_per_mile, rate_per_ton, estimated_tons, total_load_value, loaded_miles, deadhead_miles,
    reefer_temp_f, reefer_temp_min_f, reefer_temp_max_f, reefer_precool_required,
    reefer_continuous_run, reefer_notes,
    is_team_load, co_driver_name, is_hazmat, permit_required, permit_cost, permit_recovery_method,
    loadout_trailer_owner_company, loadout_trailer_owner_contact, loadout_trailer_number,
    loadout_trailer_vin, loadout_trailer_type, loadout_relocation_fee, loadout_use_period_days,
    internal_notes, driver_facing_notes, special_instructions, created_by, updated_by
  )
  VALUES (
    p_load->>'load_number',
    COALESCE((p_load->>'load_type')::load_type, 'standard'),
    'available',
    NULLIF(p_load->>'broker_id','')::uuid,
    NULLIF(p_load->>'broker_reference_number',''),
    NULL,
    v_dispatcher,
    NULLIF(p_load->>'equipment_type','')::equipment_type,
    NULLIF(p_load->>'handling_type','')::load_handling_type,
    NULLIF(p_load->>'commodity',''),
    NULLIF(p_load->>'weight_lbs','')::numeric,
    NULLIF(p_load->>'bol_number',''),
    NULLIF(p_load->>'po_number',''),
    COALESCE(NULLIF(p_load->>'rate_type','')::rate_type, 'flat'),
    NULLIF(p_load->>'linehaul_rate','')::numeric,
    NULLIF(p_load->>'fsc_amount','')::numeric,
    COALESCE((p_load->>'fsc_bundled_into_linehaul')::boolean, true),
    NULLIF(p_load->>'rate_per_mile','')::numeric,
    NULLIF(p_load->>'rate_per_ton','')::numeric,
    NULLIF(p_load->>'estimated_tons','')::numeric,
    NULLIF(p_load->>'total_load_value','')::numeric,
    NULLIF(p_load->>'loaded_miles','')::numeric,
    NULLIF(p_load->>'deadhead_miles','')::numeric,
    NULLIF(p_load->>'reefer_temp_f','')::numeric,
    NULLIF(p_load->>'reefer_temp_min_f','')::numeric,
    NULLIF(p_load->>'reefer_temp_max_f','')::numeric,
    COALESCE((p_load->>'reefer_precool_required')::boolean, false),
    COALESCE((p_load->>'reefer_continuous_run')::boolean, false),
    NULLIF(p_load->>'reefer_notes',''),
    COALESCE((p_load->>'is_team_load')::boolean, false),
    NULLIF(p_load->>'co_driver_name',''),
    COALESCE((p_load->>'is_hazmat')::boolean, false),
    COALESCE((p_load->>'permit_required')::boolean, false),
    NULLIF(p_load->>'permit_cost','')::numeric,
    NULLIF(p_load->>'permit_recovery_method',''),
    NULLIF(p_load->>'loadout_trailer_owner_company',''),
    NULLIF(p_load->>'loadout_trailer_owner_contact',''),
    NULLIF(p_load->>'loadout_trailer_number',''),
    NULLIF(p_load->>'loadout_trailer_vin',''),
    NULLIF(p_load->>'loadout_trailer_type',''),
    NULLIF(p_load->>'loadout_relocation_fee','')::numeric,
    NULLIF(p_load->>'loadout_use_period_days','')::int,
    NULLIF(p_load->>'internal_notes',''),
    NULLIF(p_load->>'driver_facing_notes',''),
    NULLIF(p_load->>'special_instructions',''),
    v_profile,
    v_profile
  )
  RETURNING id INTO v_load_id;

  FOR v_stop IN SELECT * FROM jsonb_array_elements(p_stops)
  LOOP
    v_idx := v_idx + 1;
    INSERT INTO public.load_stops (
      load_id, stop_sequence, stop_type, facility_id, facility_name, address_line1, address_line2,
      city, state, zip, contact_name, contact_phone, appointment_start, appointment_end,
      stopoff_charge_eligible, stop_notes
    ) VALUES (
      v_load_id,
      v_idx,
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
      (v_idx > 1 AND v_idx < v_count),
      NULLIF(v_stop->>'stop_notes','')
    );
  END LOOP;

  UPDATE public.facilities f
  SET times_used = f.times_used + 1,
      last_used_at = now()
  WHERE f.id IN (
    SELECT DISTINCT ls.facility_id
    FROM public.load_stops ls
    WHERE ls.load_id = v_load_id AND ls.facility_id IS NOT NULL
  );

  RETURN v_load_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.current_profile_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$function$
;