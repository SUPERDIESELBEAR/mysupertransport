CREATE TABLE public.facilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_name text NOT NULL,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  zip text,
  contact_name text,
  contact_phone text,
  contact_email text,
  facility_type text,
  default_appointment_required boolean NOT NULL DEFAULT false,
  hours_notes text,
  access_notes text,
  times_used integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.facilities TO authenticated;
GRANT ALL ON public.facilities TO service_role;

ALTER TABLE public.facilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "facilities_select_staff_and_operators"
  ON public.facilities FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'dispatcher')
    OR public.has_role(auth.uid(), 'onboarding_staff')
    OR public.has_role(auth.uid(), 'operator')
  );

CREATE POLICY "facilities_insert_staff"
  ON public.facilities FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'dispatcher')
    OR public.has_role(auth.uid(), 'onboarding_staff')
  );

CREATE POLICY "facilities_update_staff"
  ON public.facilities FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'dispatcher')
    OR public.has_role(auth.uid(), 'onboarding_staff')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'dispatcher')
    OR public.has_role(auth.uid(), 'onboarding_staff')
  );

CREATE POLICY "facilities_delete_management"
  ON public.facilities FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
  );

CREATE INDEX idx_facilities_name ON public.facilities (facility_name);
CREATE INDEX idx_facilities_city ON public.facilities (city);
CREATE INDEX idx_facilities_state ON public.facilities (state);
CREATE INDEX idx_facilities_is_active ON public.facilities (is_active);
CREATE INDEX idx_facilities_times_used ON public.facilities (times_used DESC);
CREATE UNIQUE INDEX uq_facilities_name_city_state_active
  ON public.facilities (lower(facility_name), lower(coalesce(city, '')), coalesce(state, ''))
  WHERE is_active;

CREATE TRIGGER trg_facilities_updated_at
  BEFORE UPDATE ON public.facilities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.stamp_facilities_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

CREATE TRIGGER trg_facilities_stamp_actor
  BEFORE INSERT OR UPDATE ON public.facilities
  FOR EACH ROW EXECUTE FUNCTION public.stamp_facilities_actor();

ALTER TABLE public.load_stops
  ADD COLUMN facility_id uuid REFERENCES public.facilities(id) ON DELETE SET NULL;

CREATE INDEX idx_load_stops_facility_id ON public.load_stops (facility_id);

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
$function$;