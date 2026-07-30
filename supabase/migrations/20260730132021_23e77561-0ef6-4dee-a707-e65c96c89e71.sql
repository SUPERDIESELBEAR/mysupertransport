-- 1. Carrier profile (singleton)
-- main_office_address and home_terminal_address are intentionally SEPARATE columns
-- even though this single-terminal carrier stores the same value in both.
-- 49 CFR 395.8 requires both fields on the form, and a future second terminal
-- would need them to diverge. Do not deduplicate them.
CREATE TABLE public.carrier_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name text NOT NULL,
  usdot_number text NOT NULL,
  mc_number text NOT NULL,
  main_office_address text NOT NULL,
  home_terminal_address text NOT NULL,
  home_terminal_timezone text NOT NULL,
  fmcsa_division_state text NOT NULL DEFAULT 'MO',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX carrier_profile_singleton ON public.carrier_profile ((true));

GRANT SELECT ON public.carrier_profile TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.carrier_profile TO authenticated;
GRANT ALL ON public.carrier_profile TO service_role;

ALTER TABLE public.carrier_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read the carrier profile"
  ON public.carrier_profile FOR SELECT TO authenticated USING (true);

CREATE POLICY "Management can insert the carrier profile"
  ON public.carrier_profile FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Management can update the carrier profile"
  ON public.carrier_profile FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Management can delete the carrier profile"
  ON public.carrier_profile FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE TRIGGER trg_carrier_profile_updated_at
  BEFORE UPDATE ON public.carrier_profile
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.carrier_profile
  (legal_name, usdot_number, mc_number, main_office_address, home_terminal_address, home_terminal_timezone, fmcsa_division_state)
VALUES
  ('SUPERTRANSPORT, LLC', '2309365', '788425',
   '605 Madison St, Pleasant Hill, MO 64080',
   '605 Madison St, Pleasant Hill, MO 64080',
   'America/Chicago', 'MO');

-- 2. Snapshot columns frozen onto each record at creation.
ALTER TABLE public.rods_days
  ADD COLUMN main_office_address text,
  ADD COLUMN home_terminal_timezone text;

ALTER TABLE public.eld_malfunction_events
  ADD COLUMN carrier_legal_name text,
  ADD COLUMN carrier_usdot text,
  ADD COLUMN carrier_mc text,
  ADD COLUMN carrier_main_office_address text;

-- 3. Driver-update lock covers the new frozen carrier columns.
CREATE OR REPLACE FUNCTION public.enforce_eld_event_driver_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF (NEW.operator_id, NEW.eld_device_id, NEW.discovered_at, NEW.discovered_location,
      NEW.malfunction_code, NEW.malfunction_description, NEW.hinders_hos_recording,
      NEW.backdate_reason, NEW.repair_deadline, NEW.status, NEW.resolved_at, NEW.resolution_notes,
      NEW.carrier_acknowledged_at, NEW.carrier_acknowledged_by,
      NEW.device_provider, NEW.device_make, NEW.device_model, NEW.device_serial, NEW.eld_registration_id,
      NEW.notice_generated_at, NEW.notice_sent_at, NEW.notice_send_attempts,
      NEW.escalations_suppressed_at, NEW.escalations_suppressed_by,
      NEW.escalations_suppressed_reason, NEW.escalations_suppressed_until,
      NEW.carrier_legal_name, NEW.carrier_usdot, NEW.carrier_mc, NEW.carrier_main_office_address)
     IS DISTINCT FROM
     (OLD.operator_id, OLD.eld_device_id, OLD.discovered_at, OLD.discovered_location,
      OLD.malfunction_code, OLD.malfunction_description, OLD.hinders_hos_recording,
      OLD.backdate_reason, OLD.repair_deadline, OLD.status, OLD.resolved_at, OLD.resolution_notes,
      OLD.carrier_acknowledged_at, OLD.carrier_acknowledged_by,
      OLD.device_provider, OLD.device_make, OLD.device_model, OLD.device_serial, OLD.eld_registration_id,
      OLD.notice_generated_at, OLD.notice_sent_at, OLD.notice_send_attempts,
      OLD.escalations_suppressed_at, OLD.escalations_suppressed_by,
      OLD.escalations_suppressed_reason, OLD.escalations_suppressed_until,
      OLD.carrier_legal_name, OLD.carrier_usdot, OLD.carrier_mc, OLD.carrier_main_office_address)
  THEN
    RAISE EXCEPTION 'This malfunction record is locked. Drivers may only update their own notes.';
  END IF;

  IF OLD.notice_uploaded_at IS NOT NULL AND NEW.notice_uploaded_at IS DISTINCT FROM OLD.notice_uploaded_at THEN
    RAISE EXCEPTION 'Notice upload timestamp is immutable once set.';
  END IF;

  RETURN NEW;
END;
$function$;

-- 4. Certification header guard: 8 -> 12 required fields.
CREATE OR REPLACE FUNCTION public.certify_rods_day(_day_id uuid, _legal_name text, _signature_path text, _pdf_path text DEFAULT NULL::text, _device_info text DEFAULT NULL::text)
 RETURNS rods_days
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_day public.rods_days;
  v_orig uuid;
  v_bad int;
  v_cursor int;
  v_missing text[] := '{}';
  r record;
BEGIN
  SELECT * INTO v_day FROM public.rods_days WHERE id = _day_id FOR UPDATE;
  IF v_day.id IS NULL THEN RAISE EXCEPTION 'Log not found.'; END IF;
  IF NOT (public.is_own_rods_operator(v_day.operator_id)) THEN
    RAISE EXCEPTION 'Only the driver may certify their own log.';
  END IF;
  IF v_day.status <> 'draft' THEN RAISE EXCEPTION 'Only a draft log can be certified.'; END IF;
  IF coalesce(btrim(_legal_name),'') = '' THEN RAISE EXCEPTION 'A typed legal name is required.'; END IF;

  -- Keyed logs only. An uploaded ELD document has no keyed segments by design.
  IF v_day.record_source <> 'eld_document' THEN

    -- 3a. Segment guard: no incomplete entries.
    SELECT count(*) INTO v_bad FROM public.rods_events
     WHERE rods_day_id = _day_id
       AND (end_minute IS NULL OR duty_status IS NULL
            OR coalesce(btrim(city),'') = '' OR coalesce(btrim(state),'') = '');
    IF v_bad > 0 THEN
      RAISE EXCEPTION 'Cannot certify: % duty-status entr% incomplete (missing an end time, duty status, city or state).',
        v_bad, CASE WHEN v_bad = 1 THEN 'y is' ELSE 'ies are' END;
    END IF;

    -- 3b. Segment guard: entries must tile 00:00-24:00 with no gaps or overlaps.
    v_cursor := 0;
    FOR r IN
      SELECT start_minute, end_minute FROM public.rods_events
       WHERE rods_day_id = _day_id ORDER BY start_minute
    LOOP
      IF r.start_minute > v_cursor THEN
        RAISE EXCEPTION 'Cannot certify: nothing recorded between minute % and minute % of the day.',
          v_cursor, r.start_minute;
      ELSIF r.start_minute < v_cursor THEN
        RAISE EXCEPTION 'Cannot certify: two entries overlap at minute % of the day.', r.start_minute;
      END IF;
      v_cursor := r.end_minute;
    END LOOP;
    IF v_cursor <> 1440 THEN
      RAISE EXCEPTION 'Cannot certify: % minutes of the 24-hour period are unaccounted for.', 1440 - v_cursor;
    END IF;

    -- 3c. Header guard: 49 CFR 395.8 required fields (12).
    -- total_mileage_today is deliberately excluded: only total miles driving
    -- today is explicitly required, and an unavailable odometer reading must
    -- never make a log uncertifiable. RECAP fields are never validated.
    -- The carrier identity and time-standard fields below are frozen snapshots
    -- written at draft creation from the device's cached carrier record. A
    -- certified log cannot be corrected afterward, so a blank one must never
    -- be certifiable. The client checklist in rodsValidation.ts checks the
    -- same twelve; keep them in lockstep or a valid signature lands in the
    -- rejection path.
    IF coalesce(v_day.total_miles_driving_today, -1) < 0 THEN
      v_missing := v_missing || 'total miles driving today';
    END IF;
    IF coalesce(btrim(v_day.truck_number),'') = '' THEN v_missing := v_missing || 'truck / tractor number'; END IF;
    IF coalesce(btrim(v_day.carrier_name),'') = '' THEN v_missing := v_missing || 'carrier name'; END IF;
    IF coalesce(btrim(v_day.carrier_usdot),'') = '' THEN v_missing := v_missing || 'carrier USDOT number'; END IF;
    IF coalesce(btrim(v_day.carrier_mc),'') = '' THEN v_missing := v_missing || 'carrier MC number'; END IF;
    IF coalesce(btrim(v_day.main_office_address),'') = '' THEN v_missing := v_missing || 'main office address'; END IF;
    IF coalesce(btrim(v_day.home_terminal_address),'') = '' THEN v_missing := v_missing || 'home terminal address'; END IF;
    IF coalesce(btrim(v_day.home_terminal_timezone),'') = '' THEN v_missing := v_missing || 'home terminal time zone'; END IF;
    IF coalesce(btrim(v_day.from_location),'') = '' THEN v_missing := v_missing || 'from'; END IF;
    IF coalesce(btrim(v_day.to_location),'') = '' THEN v_missing := v_missing || 'to'; END IF;
    -- "None" is a valid, explicit answer for co-driver.
    IF coalesce(btrim(v_day.co_driver_name),'') = '' THEN v_missing := v_missing || 'co-driver name'; END IF;
    IF coalesce(btrim(v_day.shipping_document_no),'') = '' THEN v_missing := v_missing || 'shipping document number or shipper and commodity'; END IF;

    IF array_length(v_missing, 1) > 0 THEN
      RAISE EXCEPTION 'Cannot certify: missing required log header fields: %.', array_to_string(v_missing, ', ');
    END IF;
  END IF;

  PERFORM set_config('rods.privileged','on', true);
  v_orig := v_day.supersedes_day_id;

  IF v_orig IS NOT NULL THEN
    UPDATE public.rods_days
       SET status = 'superseded', locked = true, updated_at = now()
     WHERE id = v_orig;
  END IF;

  UPDATE public.rods_days
     SET status = 'certified',
         locked = true,
         certified_at = now(),
         certified_by = auth.uid(),
         certification_legal_name = _legal_name,
         certification_signature_path = _signature_path,
         certification_device_info = _device_info,
         pdf_path = COALESCE(_pdf_path, pdf_path),
         updated_at = now()
   WHERE id = _day_id
  RETURNING * INTO v_day;

  PERFORM set_config('rods.privileged','off', true);
  RETURN v_day;
END;
$function$;