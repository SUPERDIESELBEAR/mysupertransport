CREATE TABLE public.load_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id uuid NOT NULL REFERENCES public.loads(id) ON DELETE CASCADE,
  load_stop_id uuid REFERENCES public.load_stops(id) ON DELETE SET NULL,
  charge_type text NOT NULL DEFAULT 'other',
  description text,
  amount numeric NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id)
);

CREATE INDEX load_charges_load_id_idx ON public.load_charges(load_id);
CREATE INDEX load_charges_load_stop_id_idx ON public.load_charges(load_stop_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.load_charges TO authenticated;
GRANT ALL ON public.load_charges TO service_role;

ALTER TABLE public.load_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY load_charges_staff_manage ON public.load_charges
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'management'::app_role)
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'dispatcher'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'management'::app_role)
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'dispatcher'::app_role)
  );

CREATE POLICY load_charges_onboarding_read ON public.load_charges
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'onboarding_staff'::app_role));

CREATE POLICY load_charges_operator_read_own ON public.load_charges
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.loads l
    JOIN public.operators o ON o.id = l.operator_id
    WHERE l.id = load_charges.load_id AND o.user_id = auth.uid()
  ));

CREATE OR REPLACE FUNCTION public.stamp_load_charges_actor()
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

REVOKE ALL ON FUNCTION public.stamp_load_charges_actor() FROM PUBLIC, anon;

CREATE TRIGGER trg_load_charges_stamp_actor
  BEFORE INSERT OR UPDATE ON public.load_charges
  FOR EACH ROW EXECUTE FUNCTION public.stamp_load_charges_actor();

CREATE TRIGGER trg_load_charges_updated_at
  BEFORE UPDATE ON public.load_charges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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
        load_id, load_stop_id, charge_type, description, amount, source
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

DROP FUNCTION IF EXISTS public.create_load_with_stops(jsonb, jsonb);