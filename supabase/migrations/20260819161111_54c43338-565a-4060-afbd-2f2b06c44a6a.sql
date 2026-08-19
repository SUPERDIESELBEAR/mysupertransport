CREATE TABLE public.load_number_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prefix text NOT NULL DEFAULT 'ST',
  include_year boolean NOT NULL DEFAULT true,
  separator text NOT NULL DEFAULT '',
  sequence_padding integer NOT NULL DEFAULT 3,
  current_year integer,
  next_sequence integer NOT NULL DEFAULT 1,
  reset_annually boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, UPDATE ON public.load_number_config TO authenticated;
GRANT ALL ON public.load_number_config TO service_role;

ALTER TABLE public.load_number_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "load_number_config_select_staff" ON public.load_number_config
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'dispatcher')
  );

CREATE POLICY "load_number_config_update_management" ON public.load_number_config
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

INSERT INTO public.load_number_config (prefix, include_year, separator, sequence_padding, reset_annually, current_year, next_sequence)
VALUES ('ST', true, '', 3, true, EXTRACT(YEAR FROM now())::int, 1);

CREATE OR REPLACE FUNCTION public.generate_load_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg public.load_number_config%ROWTYPE;
  yr int := EXTRACT(YEAR FROM now())::int;
  seq int;
  parts text;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'dispatcher')
  ) THEN
    RAISE EXCEPTION 'Not authorized to generate load numbers';
  END IF;

  SELECT * INTO cfg FROM public.load_number_config ORDER BY updated_at NULLS LAST LIMIT 1 FOR UPDATE;
  IF cfg.id IS NULL THEN
    RAISE EXCEPTION 'Load number configuration is missing';
  END IF;

  IF cfg.reset_annually AND (cfg.current_year IS DISTINCT FROM yr) THEN
    cfg.next_sequence := 1;
    cfg.current_year := yr;
  END IF;

  seq := cfg.next_sequence;

  parts := cfg.prefix;
  IF cfg.include_year THEN
    parts := parts || cfg.separator || to_char(now(), 'YY');
  END IF;
  parts := parts || cfg.separator || lpad(seq::text, GREATEST(cfg.sequence_padding, 1), '0');

  UPDATE public.load_number_config
     SET next_sequence = seq + 1,
         current_year = cfg.current_year,
         updated_at = now()
   WHERE id = cfg.id;

  RETURN parts;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_load_number() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.generate_load_number() TO authenticated;

CREATE OR REPLACE FUNCTION public.create_load_with_stops(p_load jsonb, p_stops jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_load_id uuid;
  v_count int;
  v_idx int := 0;
  v_stop jsonb;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'dispatcher')
  ) THEN
    RAISE EXCEPTION 'Not authorized to create loads';
  END IF;

  v_count := jsonb_array_length(p_stops);
  IF v_count < 2 THEN
    RAISE EXCEPTION 'A load requires at least two stops';
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
    NULLIF(p_load->>'dispatcher_id','')::uuid,
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
    auth.uid(),
    auth.uid()
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
$$;

REVOKE EXECUTE ON FUNCTION public.create_load_with_stops(jsonb, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_load_with_stops(jsonb, jsonb) TO authenticated;