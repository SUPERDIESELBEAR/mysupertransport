-- Enums
CREATE TYPE public.load_status AS ENUM ('available','covered','dispatched','in_transit','at_delivery','delivered','pod_received','accessorials_approved','ready_to_invoice','invoiced','factored','paid','settled','closed','tonu','cancelled');
CREATE TYPE public.load_type AS ENUM ('standard','per_ton','loadout');
CREATE TYPE public.equipment_type AS ENUM ('dry_van','reefer','flatbed','hopper_bottom');
CREATE TYPE public.load_handling_type AS ENUM ('live_load_unload','drop_and_hook');
CREATE TYPE public.rate_type AS ENUM ('flat','per_mile','per_ton','percentage_of_load');
CREATE TYPE public.stop_type AS ENUM ('pickup','delivery','drop_and_hook');

-- Table 1: loads
CREATE TABLE public.loads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  load_number text NOT NULL UNIQUE,
  load_type public.load_type NOT NULL DEFAULT 'standard',
  status public.load_status NOT NULL DEFAULT 'available',
  broker_id uuid REFERENCES public.brokers(id) ON DELETE RESTRICT,
  broker_reference_number text,
  operator_id uuid REFERENCES public.operators(id) ON DELETE SET NULL,
  dispatcher_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  equipment_type public.equipment_type,
  handling_type public.load_handling_type DEFAULT 'live_load_unload',
  commodity text,
  weight_lbs numeric,
  bol_number text,
  po_number text,
  rate_type public.rate_type NOT NULL DEFAULT 'flat',
  linehaul_rate numeric,
  fsc_amount numeric,
  fsc_bundled_into_linehaul boolean DEFAULT true,
  rate_per_mile numeric,
  rate_per_ton numeric,
  estimated_tons numeric,
  confirmed_tons numeric,
  total_load_value numeric,
  loaded_miles numeric,
  deadhead_miles numeric,
  reefer_temp_f numeric,
  reefer_temp_min_f numeric,
  reefer_temp_max_f numeric,
  reefer_precool_required boolean DEFAULT false,
  reefer_continuous_run boolean DEFAULT false,
  reefer_notes text,
  reefer_acknowledged_at timestamptz,
  is_team_load boolean DEFAULT false,
  co_driver_name text,
  is_hazmat boolean DEFAULT false,
  permit_required boolean DEFAULT false,
  permit_cost numeric,
  permit_recovery_method text,
  loadout_trailer_owner_company text,
  loadout_trailer_owner_contact text,
  loadout_trailer_number text,
  loadout_trailer_vin text,
  loadout_trailer_type text,
  loadout_relocation_fee numeric,
  loadout_use_period_days integer,
  loadout_use_period_start date,
  loadout_use_period_end date,
  driver_accepted_at timestamptz,
  driver_declined_at timestamptz,
  driver_decline_reason text,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  internal_notes text,
  driver_facing_notes text,
  special_instructions text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loads TO authenticated;
GRANT ALL ON public.loads TO service_role;
ALTER TABLE public.loads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loads_staff_manage" ON public.loads
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'dispatcher'))
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'dispatcher'));

CREATE POLICY "loads_onboarding_staff_read" ON public.loads
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'onboarding_staff'));

CREATE POLICY "loads_operator_read_own" ON public.loads
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.operators o WHERE o.id = loads.operator_id AND o.user_id = auth.uid()));

CREATE POLICY "loads_operator_update_own" ON public.loads
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.operators o WHERE o.id = loads.operator_id AND o.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.operators o WHERE o.id = loads.operator_id AND o.user_id = auth.uid()));

-- Table 2: load_stops
CREATE TABLE public.load_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id uuid NOT NULL REFERENCES public.loads(id) ON DELETE CASCADE,
  stop_sequence integer NOT NULL,
  stop_type public.stop_type NOT NULL,
  facility_name text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  zip text,
  contact_name text,
  contact_phone text,
  appointment_start timestamptz,
  appointment_end timestamptz,
  actual_arrival_at timestamptz,
  actual_departure_at timestamptz,
  arrival_latitude numeric,
  arrival_longitude numeric,
  departure_latitude numeric,
  departure_longitude numeric,
  stopoff_charge_eligible boolean DEFAULT false,
  stopoff_charge_amount numeric,
  stop_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT load_stops_load_sequence_unique UNIQUE (load_id, stop_sequence)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.load_stops TO authenticated;
GRANT ALL ON public.load_stops TO service_role;
ALTER TABLE public.load_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "load_stops_staff_manage" ON public.load_stops
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'dispatcher'))
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'dispatcher'));

CREATE POLICY "load_stops_onboarding_staff_read" ON public.load_stops
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'onboarding_staff'));

CREATE POLICY "load_stops_operator_read_own" ON public.load_stops
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.loads l JOIN public.operators o ON o.id = l.operator_id WHERE l.id = load_stops.load_id AND o.user_id = auth.uid()));

CREATE POLICY "load_stops_operator_update_own" ON public.load_stops
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.loads l JOIN public.operators o ON o.id = l.operator_id WHERE l.id = load_stops.load_id AND o.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.loads l JOIN public.operators o ON o.id = l.operator_id WHERE l.id = load_stops.load_id AND o.user_id = auth.uid()));

-- Indexes
CREATE INDEX idx_loads_status ON public.loads(status);
CREATE INDEX idx_loads_operator_id ON public.loads(operator_id);
CREATE INDEX idx_loads_dispatcher_id ON public.loads(dispatcher_id);
CREATE INDEX idx_loads_broker_id ON public.loads(broker_id);
CREATE INDEX idx_loads_load_number ON public.loads(load_number);
CREATE INDEX idx_loads_created_at ON public.loads(created_at);
CREATE INDEX idx_load_stops_load_id ON public.load_stops(load_id);
CREATE INDEX idx_load_stops_load_id_sequence ON public.load_stops(load_id, stop_sequence);

-- updated_at triggers
CREATE TRIGGER update_loads_updated_at BEFORE UPDATE ON public.loads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_load_stops_updated_at BEFORE UPDATE ON public.load_stops
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Operator column whitelists
CREATE OR REPLACE FUNCTION public.enforce_loads_operator_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed text[] := ARRAY['driver_accepted_at','driver_declined_at','driver_decline_reason','reefer_acknowledged_at','updated_at'];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner')
     OR public.has_role(auth.uid(), 'dispatcher') THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'operator') THEN
    IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
      RAISE EXCEPTION 'Operators may only update driver action fields on their loads';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_loads_operator_update() FROM public, anon, authenticated;

CREATE TRIGGER enforce_loads_operator_update_trg
  BEFORE UPDATE ON public.loads
  FOR EACH ROW EXECUTE FUNCTION public.enforce_loads_operator_update();

CREATE OR REPLACE FUNCTION public.enforce_load_stops_operator_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed text[] := ARRAY['actual_arrival_at','actual_departure_at','arrival_latitude','arrival_longitude','departure_latitude','departure_longitude','updated_at'];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner')
     OR public.has_role(auth.uid(), 'dispatcher') THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'operator') THEN
    IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
      RAISE EXCEPTION 'Operators may only update arrival, departure, and location fields on their stops';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_load_stops_operator_update() FROM public, anon, authenticated;

CREATE TRIGGER enforce_load_stops_operator_update_trg
  BEFORE UPDATE ON public.load_stops
  FOR EACH ROW EXECUTE FUNCTION public.enforce_load_stops_operator_update();