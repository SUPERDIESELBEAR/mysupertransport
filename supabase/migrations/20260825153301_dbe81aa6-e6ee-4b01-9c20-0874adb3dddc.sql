ALTER TABLE public.load_charges
  ADD COLUMN driver_paid_amount numeric DEFAULT NULL;

CREATE INDEX load_charges_driver_paid_amount_idx ON public.load_charges(load_id) WHERE driver_paid_amount IS NOT NULL;

ALTER TABLE public.brokers
  ADD COLUMN do_not_load boolean NOT NULL DEFAULT false,
  ADD COLUMN do_not_load_reason text,
  ADD COLUMN do_not_load_date date,
  ADD COLUMN dispatcher_notes text,
  ADD COLUMN rating smallint CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  ADD COLUMN carrier_packet_status text,
  ADD COLUMN broker_agreement_status text;

CREATE INDEX brokers_do_not_load_idx ON public.brokers(do_not_load);
CREATE INDEX brokers_carrier_packet_status_idx ON public.brokers(carrier_packet_status);

CREATE TABLE public.broker_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id uuid NOT NULL REFERENCES public.brokers(id) ON DELETE CASCADE,
  name text,
  role text,
  email text,
  phone text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broker_contacts TO authenticated;
GRANT ALL ON public.broker_contacts TO service_role;

ALTER TABLE public.broker_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY broker_contacts_staff_manage ON public.broker_contacts
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'management'::app_role)
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'dispatcher'::app_role)
    OR public.has_role(auth.uid(), 'onboarding_staff'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'management'::app_role)
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'dispatcher'::app_role)
    OR public.has_role(auth.uid(), 'onboarding_staff'::app_role)
  );

CREATE UNIQUE INDEX broker_contacts_single_primary_per_broker
  ON public.broker_contacts(broker_id) WHERE is_primary;

CREATE INDEX broker_contacts_broker_id_idx ON public.broker_contacts(broker_id);

CREATE TRIGGER update_broker_contacts_updated_at
  BEFORE UPDATE ON public.broker_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.stamp_broker_contacts_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, public.current_profile_id());
    NEW.updated_by := COALESCE(NEW.updated_by, NEW.created_by);
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.updated_by := COALESCE(public.current_profile_id(), OLD.updated_by);
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.stamp_broker_contacts_actor() FROM PUBLIC, anon;

CREATE TRIGGER trg_broker_contacts_stamp_actor
  BEFORE INSERT OR UPDATE ON public.broker_contacts
  FOR EACH ROW EXECUTE FUNCTION public.stamp_broker_contacts_actor();

CREATE OR REPLACE FUNCTION public.create_load_with_stops(p_load jsonb, p_stops jsonb, p_charges jsonb DEFAULT '[]'::jsonb)
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
  v_charge jsonb;
  v_profile uuid;
  v_dispatcher uuid;
  v_middle boolean;
  v_stop_ids uuid[] := '{}';
  v_stop_id uuid;
  v_stop_index int;
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
    loadout_use_start, loadout_use_end, loadout_use_window_source,
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
    NULLIF(p_load->>'loadout_use_start','')::timestamptz,
    NULLIF(p_load->>'loadout_use_end','')::timestamptz,
    NULLIF(p_load->>'loadout_use_window_source',''),
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
    v_middle := (v_idx > 1 AND v_idx < v_count);
    INSERT INTO public.load_stops (
      load_id, stop_sequence, stop_type, facility_id, facility_name, address_line1, address_line2,
      city, state, zip, contact_name, contact_phone, appointment_start, appointment_end,
      stopoff_charge_eligible, stopoff_charge_amount, reference_number, reference_label, stop_notes
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
      v_middle,
      CASE WHEN v_middle THEN NULLIF(v_stop->>'stopoff_charge_amount','')::numeric ELSE NULL END,
      NULLIF(v_stop->>'reference_number',''),
      NULLIF(v_stop->>'reference_label',''),
      NULLIF(v_stop->>'stop_notes','')
    )
    RETURNING id INTO v_stop_id;
    v_stop_ids := array_append(v_stop_ids, v_stop_id);
  END LOOP;

  IF p_charges IS NOT NULL AND jsonb_typeof(p_charges) = 'array' THEN
    FOR v_charge IN SELECT * FROM jsonb_array_elements(p_charges)
    LOOP
      v_stop_index := NULLIF(v_charge->>'stop_index','')::int;
      INSERT INTO public.load_charges (
        load_id, load_stop_id, charge_type, description, amount, driver_paid_amount, source
      ) VALUES (
        v_load_id,
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
        NULLIF(v_charge->>'driver_paid_amount','')::numeric,
        COALESCE(NULLIF(v_charge->>'source',''), 'manual')
      );
    END LOOP;
  END IF;

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
$function$;

REVOKE ALL ON FUNCTION public.create_load_with_stops(jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_load_with_stops(jsonb, jsonb, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_load_with_stops(p_load_id uuid, p_load jsonb, p_stops jsonb, p_charges jsonb DEFAULT '[]'::jsonb, p_reason text DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_profile uuid;
  v_load public.loads%ROWTYPE;
  v_new jsonb;
  v_old jsonb;
  v_changes jsonb := '[]'::jsonb;
  v_count int;
  v_idx int;
  v_stop jsonb;
  v_old_stop public.load_stops%ROWTYPE;
  v_stop_id uuid;
  v_middle boolean;
  v_stop_ids uuid[] := '{}';
  v_stop_index int;
  v_charge jsonb;
  v_charge_sum numeric;
  v_total numeric;
  v_base numeric;
  v_key text;
  v_a text;
  v_b text;
  v_num_keys text[] := ARRAY['linehaul_rate','rate_per_mile','rate_per_ton','estimated_tons','fsc_amount','loaded_miles','deadhead_miles','total_load_value','loadout_relocation_fee','permit_cost','stopoff_charge_amount'];
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'dispatcher')
  ) THEN
    RAISE EXCEPTION 'Not authorized to update loads';
  END IF;

  v_profile := public.current_profile_id();

  SELECT * INTO v_load FROM public.loads WHERE id = p_load_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Load not found';
  END IF;

  v_new := p_load;
  v_old := to_jsonb(v_load);

  -- Financial lock: once a load is delivered or beyond, only owners may change what the broker is billed.
  IF v_load.status IN ('delivered','pod_received','accessorials_approved','ready_to_invoice','invoiced','factored','paid','settled','closed') THEN
    IF NOT public.has_role(auth.uid(), 'owner') AND p_reason IS NULL THEN
      RAISE EXCEPTION 'Financial changes require an owner override reason after delivery';
    END IF;
  END IF;

  -- Load-level field changes
  FOR v_key IN SELECT unnest(ARRAY['broker_id','broker_reference_number','equipment_type','handling_type','commodity','weight_lbs','bol_number','po_number','rate_type','linehaul_rate','rate_per_mile','rate_per_ton','estimated_tons','fsc_amount','fsc_bundled_into_linehaul','loaded_miles','deadhead_miles','total_load_value','loadout_trailer_owner_company','loadout_trailer_owner_contact','loadout_trailer_number','loadout_trailer_vin','loadout_trailer_type','loadout_relocation_fee','loadout_use_period_days','loadout_use_start','loadout_use_end','loadout_use_window_source','internal_notes','driver_facing_notes','special_instructions','is_team_load','co_driver_name','is_hazmat','permit_required','permit_cost','permit_recovery_method','reefer_temp_f','reefer_temp_min_f','reefer_temp_max_f','reefer_precool_required','reefer_continuous_run','reefer_notes'])
  LOOP
    SELECT (v_old->>v_key) INTO v_a;
    SELECT (v_new->>v_key) INTO v_b;
    IF v_key = ANY(v_num_keys) THEN
      CONTINUE WHEN nullif(v_a,'')::numeric IS NOT DISTINCT FROM nullif(v_b,'')::numeric;
    ELSIF v_key = 'fsc_bundled_into_linehaul' OR v_key = 'reefer_precool_required' OR v_key = 'reefer_continuous_run' OR v_key = 'is_team_load' OR v_key = 'is_hazmat' OR v_key = 'permit_required' THEN
      CONTINUE WHEN (nullif(v_a,'')::boolean) IS NOT DISTINCT FROM (nullif(v_b,'')::boolean);
    ELSE
      CONTINUE WHEN v_a IS NOT DISTINCT FROM v_b;
    END IF;

    IF v_key IN ('linehaul_rate','rate_per_mile','rate_per_ton','estimated_tons','fsc_amount','loaded_miles','deadhead_miles','total_load_value','loadout_relocation_fee','permit_cost') THEN
      IF v_load.status IN ('delivered','pod_received','accessorials_approved','ready_to_invoice','invoiced','factored','paid','settled','closed') THEN
        IF NOT public.has_role(auth.uid(), 'owner') THEN
          RAISE EXCEPTION 'Only the owner can change financial fields after delivery';
        END IF;
      END IF;
    END IF;

    v_changes := v_changes || jsonb_build_array(
      jsonb_build_object('f',v_key,'a',v_a,'b',v_b,'fin',v_key = ANY(v_num_keys)));
  END LOOP;

  v_count := jsonb_array_length(p_stops);
  IF v_count < 2 THEN
    RAISE EXCEPTION 'A load requires at least two stops';
  END IF;

  v_idx := 0;
  FOR v_stop IN SELECT * FROM jsonb_array_elements(p_stops)
  LOOP
    v_idx := v_idx + 1;
    v_middle := (v_idx > 1 AND v_idx < v_count);

    SELECT * INTO v_old_stop
    FROM public.load_stops
    WHERE load_id = p_load_id AND stop_sequence = abs(v_idx)
    ORDER BY CASE WHEN stop_sequence < 0 THEN 0 ELSE 1 END, stop_sequence
    LIMIT 1;

    IF FOUND THEN
      v_stop_id := v_old_stop.id;
      UPDATE public.load_stops SET
        stop_sequence = v_idx,
        stop_type = COALESCE(NULLIF(v_stop->>'stop_type','')::stop_type, v_old_stop.stop_type),
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
        stopoff_charge_eligible = v_middle,
        stopoff_charge_amount = CASE WHEN v_middle THEN NULLIF(v_stop->>'stopoff_charge_amount','')::numeric ELSE NULL END,
        reference_number = NULLIF(v_stop->>'reference_number',''),
        reference_label = NULLIF(v_stop->>'reference_label',''),
        stop_notes = NULLIF(v_stop->>'stop_notes','')
      WHERE id = v_stop_id;

      FOR v_key IN SELECT unnest(ARRAY['facility_name','address_line1','address_line2','city','state','zip','contact_name','contact_phone',
                                   'appointment_start','appointment_end','reference_number',
                                   'reference_label','stopoff_charge_amount','stop_notes']) LOOP
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
          v_key = 'stopoff_charge_amount', p_reason, v_profile
        );
      END LOOP;

      IF v_old_stop.stop_sequence <> -v_idx THEN
        INSERT INTO public.load_change_history (
          load_id, field_path, previous_value, new_value, is_financial, reason, changed_by
        ) VALUES (p_load_id, 'stop order', 'position ' || abs(v_old_stop.stop_sequence),
                  'position ' || v_idx, false, p_reason, v_profile);
      END IF;
    ELSE
      INSERT INTO public.load_stops (
        load_id, stop_sequence, stop_type, facility_id, facility_name, address_line1, address_line2,
        city, state, zip, contact_name, contact_phone, appointment_start, appointment_end,
        stopoff_charge_eligible, stopoff_charge_amount, reference_number, reference_label, stop_notes
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
        NULLIF(v_stop->>'stop_notes','')
      ) RETURNING id INTO v_stop_id;

      INSERT INTO public.load_change_history (
        load_id, field_path, previous_value, new_value, is_financial, reason, changed_by
      ) VALUES (
        p_load_id, 'stop_added', NULL,
        'Stop ' || v_idx || ': ' || coalesce(NULLIF(v_stop->>'facility_name',''),
          coalesce(v_stop->>'city','') || ' ' || coalesce(v_stop->>'state','')),
        false, p_reason, v_profile
      );
    END IF;

    v_stop_ids := array_append(v_stop_ids, v_stop_id);
  END LOOP;

  DELETE FROM public.load_charges WHERE load_id = p_load_id;

  IF p_charges IS NOT NULL AND jsonb_typeof(p_charges) = 'array' THEN
    FOR v_charge IN SELECT * FROM jsonb_array_elements(p_charges) LOOP
      v_stop_index := NULLIF(v_charge->>'stop_index','')::int;
      INSERT INTO public.load_charges (
        load_id, load_stop_id, charge_type, description, amount, driver_paid_amount, source, created_by, updated_by
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
        NULLIF(v_charge->>'driver_paid_amount','')::numeric,
        COALESCE(NULLIF(v_charge->>'source',''), 'manual'),
        v_profile, v_profile
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
    loadout_use_start = nullif(v_new->>'loadout_use_start','')::timestamptz,
    loadout_use_end = nullif(v_new->>'loadout_use_end','')::timestamptz,
    loadout_use_window_source = nullif(v_new->>'loadout_use_window_source',''),
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
    permit_recovery_method = nullif(v_new->>'permit_recovery_method',''),
    updated_by = v_profile,
    updated_at = now()
  WHERE id = p_load_id;

  IF jsonb_array_length(v_changes) > 0 THEN
    INSERT INTO public.load_change_history (load_id, field_path, previous_value, new_value, is_financial, reason, changed_by)
    SELECT p_load_id, 'load · ' || (c->>'f'), c->>'a', c->>'b', (c->>'fin')::boolean, p_reason, v_profile
    FROM jsonb_array_elements(v_changes) c;
  END IF;

  RETURN p_load_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_load_with_stops(uuid, jsonb, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_load_with_stops(uuid, jsonb, jsonb, jsonb, text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.update_load_with_stops(uuid, jsonb, jsonb);