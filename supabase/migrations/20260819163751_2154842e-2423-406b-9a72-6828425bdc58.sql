CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_load_with_stops(p_load jsonb, p_stops jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
      load_id, stop_sequence, stop_type, facility_name, address_line1, address_line2,
      city, state, zip, contact_name, contact_phone, appointment_start, appointment_end,
      stopoff_charge_eligible, stop_notes
    ) VALUES (
      v_load_id,
      v_idx,
      COALESCE(NULLIF(v_stop->>'stop_type','')::stop_type, 'pickup'),
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

  RETURN v_load_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_load_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.load_status_history (load_id, previous_status, new_status, changed_by)
  VALUES (NEW.id, OLD.status, NEW.status, public.current_profile_id());
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_broker_factoring_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.broker_factoring_history (broker_id, previous_status, new_status, reason, changed_by)
  VALUES (NEW.id, OLD.factoring_status, NEW.factoring_status, NEW.factoring_status_reason, public.current_profile_id());
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_claim_flag_resolution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_resolved boolean;
BEGIN
  v_resolved := (NULLIF(btrim(COALESCE(NEW.resolution, '')), '') IS NOT NULL)
                OR NEW.flag_level = 'cleared'::claim_flag_level;

  IF v_resolved THEN
    NEW.is_active := false;
    IF NEW.resolved_at IS NULL THEN
      NEW.resolved_at := now();
    END IF;
    IF NEW.resolved_by IS NULL THEN
      NEW.resolved_by := public.current_profile_id();
    END IF;
  ELSE
    NEW.resolved_at := NULL;
    NEW.resolved_by := NULL;
    IF TG_OP = 'UPDATE' AND OLD.is_active = false THEN
      NEW.is_active := true;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_claim_flag_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_action text;
  v_actor uuid := public.current_profile_id();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.claim_flag_history (
      claim_flag_id, load_id, action,
      new_flag_level, new_is_active, new_resolution,
      new_estimated_amount, new_actual_amount, changed_by
    ) VALUES (
      NEW.id, NEW.load_id, 'created',
      NEW.flag_level, NEW.is_active, NEW.resolution,
      NEW.estimated_claim_amount, NEW.actual_claim_amount, v_actor
    );
    RETURN NEW;
  END IF;

  IF NEW.flag_level IS DISTINCT FROM OLD.flag_level
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.resolution IS DISTINCT FROM OLD.resolution
     OR NEW.estimated_claim_amount IS DISTINCT FROM OLD.estimated_claim_amount
     OR NEW.actual_claim_amount IS DISTINCT FROM OLD.actual_claim_amount
  THEN
    IF OLD.is_active IS TRUE AND NEW.is_active IS FALSE THEN
      v_action := 'resolved';
    ELSIF OLD.is_active IS FALSE AND NEW.is_active IS TRUE THEN
      v_action := 'reopened';
    ELSE
      v_action := 'updated';
    END IF;

    INSERT INTO public.claim_flag_history (
      claim_flag_id, load_id, action,
      previous_flag_level, new_flag_level,
      previous_is_active, new_is_active,
      previous_resolution, new_resolution,
      previous_estimated_amount, new_estimated_amount,
      previous_actual_amount, new_actual_amount,
      changed_by
    ) VALUES (
      NEW.id, NEW.load_id, v_action,
      OLD.flag_level, NEW.flag_level,
      OLD.is_active, NEW.is_active,
      OLD.resolution, NEW.resolution,
      OLD.estimated_claim_amount, NEW.estimated_claim_amount,
      OLD.actual_claim_amount, NEW.actual_claim_amount,
      v_actor
    );
  END IF;

  RETURN NEW;
END;
$function$;