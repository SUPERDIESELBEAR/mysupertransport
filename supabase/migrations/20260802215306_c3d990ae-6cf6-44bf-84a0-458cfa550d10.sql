CREATE TABLE public.eld_extension_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.eld_malfunction_events(id) ON DELETE CASCADE,
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  is_demo boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','granted','denied','withdrawn')),

  filer_name text NOT NULL,
  filer_title text NOT NULL,
  filer_phone text NOT NULL,
  filer_email text NOT NULL,

  carrier_legal_name text NOT NULL,
  carrier_usdot text NOT NULL,
  carrier_mc text,
  carrier_main_office_address text NOT NULL,
  fmcsa_division_state text NOT NULL,

  device_provider text,
  device_make text,
  device_model text,
  device_serial text,
  eld_registration_id text,

  driver_name text NOT NULL,
  driver_license_number text,
  driver_license_state text,
  vehicle_unit_number text,
  vehicle_vin text,

  malfunction_code text NOT NULL,
  malfunction_description text NOT NULL,
  discovered_at timestamptz NOT NULL,
  reported_at timestamptz NOT NULL,
  discovered_location text NOT NULL,
  repair_deadline date NOT NULL,

  actions_taken text NOT NULL,
  why_extension_needed text NOT NULL,
  requested_through date NOT NULL,

  pdf_path text,
  generated_at timestamptz,
  submitted_at timestamptz,
  submitted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  response_status_at timestamptz,
  response_date date,
  response_reference text,
  response_notes text,
  granted_through date,
  responded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT eld_extension_requests_through_after_deadline
    CHECK (requested_through > repair_deadline),
  CONSTRAINT eld_extension_requests_granted_through_after_deadline
    CHECK (granted_through IS NULL OR granted_through > repair_deadline)
);

COMMENT ON TABLE public.eld_extension_requests IS
  '49 CFR 395.34(d)(2) repair-extension filings. Carrier, device, driver and vehicle columns are a FROZEN snapshot taken when the request is drafted: the PDF must reproduce what was filed, never the current eld_devices/carrier_profile row.';

CREATE UNIQUE INDEX eld_extension_requests_one_open_per_event
  ON public.eld_extension_requests (event_id)
  WHERE status IN ('draft','submitted');
CREATE INDEX idx_eld_extension_requests_event ON public.eld_extension_requests (event_id);
CREATE INDEX idx_eld_extension_requests_operator ON public.eld_extension_requests (operator_id);
CREATE INDEX idx_eld_extension_requests_is_demo ON public.eld_extension_requests (is_demo) WHERE is_demo;

GRANT SELECT, INSERT, UPDATE ON public.eld_extension_requests TO authenticated;
GRANT ALL ON public.eld_extension_requests TO service_role;

ALTER TABLE public.eld_extension_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY eld_extension_requests_select_staff_or_own
  ON public.eld_extension_requests FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    OR (
      status <> 'draft'
      AND EXISTS (
        SELECT 1 FROM public.operators o
        WHERE o.id = eld_extension_requests.operator_id AND o.user_id = auth.uid()
      )
    )
  );

CREATE POLICY eld_extension_requests_insert_management
  ON public.eld_extension_requests FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'management'::app_role)
    OR public.has_role(auth.uid(), 'owner'::app_role)
  );

CREATE POLICY eld_extension_requests_update_management
  ON public.eld_extension_requests FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'management'::app_role)
    OR public.has_role(auth.uid(), 'owner'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'management'::app_role)
    OR public.has_role(auth.uid(), 'owner'::app_role)
  );

CREATE TRIGGER trg_eld_extension_requests_is_demo
  BEFORE INSERT OR UPDATE ON public.eld_extension_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_record_is_demo();

CREATE TRIGGER trg_eld_extension_requests_updated_at
  BEFORE UPDATE ON public.eld_extension_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.enforce_eld_extension_request_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'A filed extension request is part of the compliance record and cannot be deleted.'
        USING ERRCODE = 'P0114';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status <> 'draft' THEN
    IF (NEW.event_id, NEW.operator_id,
        NEW.filer_name, NEW.filer_title, NEW.filer_phone, NEW.filer_email,
        NEW.carrier_legal_name, NEW.carrier_usdot, NEW.carrier_mc,
        NEW.carrier_main_office_address, NEW.fmcsa_division_state,
        NEW.device_provider, NEW.device_make, NEW.device_model, NEW.device_serial,
        NEW.eld_registration_id,
        NEW.driver_name, NEW.driver_license_number, NEW.driver_license_state,
        NEW.vehicle_unit_number, NEW.vehicle_vin,
        NEW.malfunction_code, NEW.malfunction_description, NEW.discovered_at,
        NEW.reported_at, NEW.discovered_location, NEW.repair_deadline,
        NEW.actions_taken, NEW.why_extension_needed, NEW.requested_through,
        NEW.pdf_path, NEW.generated_at, NEW.submitted_at, NEW.submitted_by)
       IS DISTINCT FROM
       (OLD.event_id, OLD.operator_id,
        OLD.filer_name, OLD.filer_title, OLD.filer_phone, OLD.filer_email,
        OLD.carrier_legal_name, OLD.carrier_usdot, OLD.carrier_mc,
        OLD.carrier_main_office_address, OLD.fmcsa_division_state,
        OLD.device_provider, OLD.device_make, OLD.device_model, OLD.device_serial,
        OLD.eld_registration_id,
        OLD.driver_name, OLD.driver_license_number, OLD.driver_license_state,
        OLD.vehicle_unit_number, OLD.vehicle_vin,
        OLD.malfunction_code, OLD.malfunction_description, OLD.discovered_at,
        OLD.reported_at, OLD.discovered_location, OLD.repair_deadline,
        OLD.actions_taken, OLD.why_extension_needed, OLD.requested_through,
        OLD.pdf_path, OLD.generated_at, OLD.submitted_at, OLD.submitted_by)
    THEN
      RAISE EXCEPTION 'An extension request is append-only once it has been filed with FMCSA.'
        USING ERRCODE = 'P0110';
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'draft'     AND NEW.status IN ('submitted','withdrawn'))
      OR (OLD.status = 'submitted' AND NEW.status IN ('granted','denied','withdrawn'))
      OR (OLD.status = 'denied'    AND NEW.status = 'withdrawn')
    ) THEN
      RAISE EXCEPTION 'An extension request cannot move from % to %.', OLD.status, NEW.status
        USING ERRCODE = 'P0111';
    END IF;
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'submitted' AND NEW.submitted_at IS NULL THEN
    NEW.submitted_at := now();
  END IF;

  IF NEW.status IN ('granted','denied') THEN
    IF NEW.response_date IS NULL OR COALESCE(btrim(NEW.response_notes), '') = '' THEN
      RAISE EXCEPTION 'Recording an FMCSA response needs the response date and what FMCSA said.'
        USING ERRCODE = 'P0113';
    END IF;
    IF NEW.status = 'granted' AND NEW.granted_through IS NULL THEN
      RAISE EXCEPTION 'A granted extension must name the date the relief runs through.'
        USING ERRCODE = 'P0112';
    END IF;
    IF NEW.response_status_at IS NULL THEN
      NEW.response_status_at := now();
    END IF;
  END IF;

  IF OLD.response_status_at IS NOT NULL
     AND NEW.response_status_at IS DISTINCT FROM OLD.response_status_at THEN
    RAISE EXCEPTION 'The time an FMCSA response was recorded is immutable once set.'
      USING ERRCODE = 'P0115';
  END IF;

  IF OLD.status IN ('granted','denied') THEN
    IF (NEW.response_date, NEW.response_reference, NEW.response_notes,
        NEW.granted_through, NEW.responded_by)
       IS DISTINCT FROM
       (OLD.response_date, OLD.response_reference, OLD.response_notes,
        OLD.granted_through, OLD.responded_by)
    THEN
      RAISE EXCEPTION 'An FMCSA response cannot be revised after it was recorded.'
        USING ERRCODE = 'P0110';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_eld_extension_requests_write
  BEFORE UPDATE OR DELETE ON public.eld_extension_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_eld_extension_request_write();

CREATE OR REPLACE FUNCTION public.recompute_eld_extension_projection(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_tz text;
  v_today date;
  v_req public.eld_extension_requests%ROWTYPE;
  v_first_filed timestamptz;
BEGIN
  SELECT home_terminal_timezone INTO v_tz FROM public.carrier_profile LIMIT 1;
  v_tz := COALESCE(v_tz, 'America/Chicago');
  v_today := (now() AT TIME ZONE v_tz)::date;

  SELECT min(x.submitted_at) INTO v_first_filed
  FROM public.eld_extension_requests x
  WHERE x.event_id = p_event_id AND x.submitted_at IS NOT NULL;

  SELECT r.* INTO v_req
  FROM public.eld_extension_requests r
  WHERE r.event_id = p_event_id
    AND r.status = 'granted'
    AND r.granted_through >= v_today
  ORDER BY r.granted_through DESC, r.response_status_at DESC NULLS LAST
  LIMIT 1;

  UPDATE public.eld_malfunction_events e
  SET extension_requested_at = v_first_filed,
      extension_granted_at   = v_req.response_status_at,
      extension_granted_by   = v_req.responded_by,
      extension_expires_on   = v_req.granted_through,
      extension_notes        = CASE
        WHEN v_req.id IS NULL THEN NULL
        ELSE 'FMCSA response ' || to_char(v_req.response_date, 'YYYY-MM-DD')
             || COALESCE(' (ref ' || nullif(btrim(v_req.response_reference), '') || ')', '')
             || ': ' || v_req.response_notes
      END
  WHERE e.id = p_event_id
    AND (e.extension_requested_at, e.extension_granted_at, e.extension_granted_by,
         e.extension_expires_on)
        IS DISTINCT FROM
        (v_first_filed, v_req.response_status_at, v_req.responded_by, v_req.granted_through);
END;
$$;

COMMENT ON FUNCTION public.recompute_eld_extension_projection(uuid) IS
  'Projects eld_malfunction_events.extension_* from the SET of requests on the event, never from the row being written: a denial or withdrawal can never revoke a separate grant that is still in force, and a lapsed grant stops projecting on its own.';

CREATE OR REPLACE FUNCTION public.project_eld_extension_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  PERFORM public.recompute_eld_extension_projection(
    CASE WHEN TG_OP = 'DELETE' THEN OLD.event_id ELSE NEW.event_id END
  );
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_eld_extension_requests_project
  AFTER INSERT OR UPDATE OR DELETE ON public.eld_extension_requests
  FOR EACH ROW EXECUTE FUNCTION public.project_eld_extension_request();