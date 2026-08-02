-- 1. Table
CREATE TABLE public.rods_correction_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  log_date date NOT NULL,
  rods_day_id uuid REFERENCES public.rods_days(id) ON DELETE SET NULL,
  requested_by uuid,
  requested_by_name text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  issue text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','actioned','declined')),
  driver_response text,
  resolved_at timestamptz,
  resolved_by_day_id uuid REFERENCES public.rods_days(id) ON DELETE SET NULL,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Grants
GRANT SELECT, INSERT, UPDATE ON public.rods_correction_requests TO authenticated;
GRANT ALL ON public.rods_correction_requests TO service_role;

-- 3. RLS
ALTER TABLE public.rods_correction_requests ENABLE ROW LEVEL SECURITY;

-- 4. Policies
CREATE POLICY "Staff read all correction requests"
  ON public.rods_correction_requests FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff raise correction requests"
  ON public.rods_correction_requests FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND requested_by = auth.uid());

CREATE POLICY "Drivers read own correction requests"
  ON public.rods_correction_requests FOR SELECT TO authenticated
  USING (public.is_own_rods_operator(operator_id));

CREATE POLICY "Drivers respond to own correction requests"
  ON public.rods_correction_requests FOR UPDATE TO authenticated
  USING (public.is_own_rods_operator(operator_id))
  WITH CHECK (public.is_own_rods_operator(operator_id));

-- No staff UPDATE. No DELETE policy for anyone.

-- 5. One open request per driver per date
CREATE UNIQUE INDEX rods_correction_requests_one_open_per_date
  ON public.rods_correction_requests (operator_id, log_date)
  WHERE status = 'open';

CREATE INDEX rods_correction_requests_operator_date_idx
  ON public.rods_correction_requests (operator_id, log_date);

-- 6. Insert guard: anchor to a currently certified day; stamp is_demo
CREATE OR REPLACE FUNCTION public.enforce_rods_correction_request_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day public.rods_days;
BEGIN
  IF coalesce(btrim(NEW.issue),'') = '' THEN
    RAISE EXCEPTION 'A correction request must describe the issue.' USING ERRCODE = 'P0070';
  END IF;

  IF NEW.rods_day_id IS NULL THEN
    RAISE EXCEPTION 'A correction request must name the log it was raised against.' USING ERRCODE = 'P0070';
  END IF;

  SELECT * INTO v_day FROM public.rods_days WHERE id = NEW.rods_day_id;
  IF v_day.id IS NULL THEN
    RAISE EXCEPTION 'That log does not exist.' USING ERRCODE = 'P0070';
  END IF;
  IF v_day.status <> 'certified' THEN
    RAISE EXCEPTION 'A correction can only be requested against a certified log.' USING ERRCODE = 'P0071';
  END IF;

  -- Provenance only: the request is anchored on the driver and the date.
  NEW.operator_id := v_day.operator_id;
  NEW.log_date := v_day.log_date;

  NEW.status := 'open';
  NEW.driver_response := NULL;
  NEW.resolved_at := NULL;
  NEW.resolved_by_day_id := NULL;
  NEW.requested_at := now();

  SELECT coalesce(o.is_demo, false) INTO NEW.is_demo
    FROM public.operators o WHERE o.id = NEW.operator_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rods_correction_request_insert
  BEFORE INSERT ON public.rods_correction_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_rods_correction_request_insert();

-- 7. Update whitelist: append-only apart from the driver's answer
CREATE OR REPLACE FUNCTION public.enforce_rods_correction_request_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_privileged boolean := coalesce(current_setting('rods.privileged', true), 'off') = 'on';
BEGIN
  -- Immutable provenance under every path.
  IF NEW.id <> OLD.id
     OR NEW.operator_id <> OLD.operator_id
     OR NEW.log_date <> OLD.log_date
     OR NEW.rods_day_id IS DISTINCT FROM OLD.rods_day_id
     OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
     OR NEW.requested_by_name IS DISTINCT FROM OLD.requested_by_name
     OR NEW.requested_at <> OLD.requested_at
     OR NEW.issue <> OLD.issue
     OR NEW.is_demo <> OLD.is_demo
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'A correction request is append-only; only the driver''s response may be recorded.'
      USING ERRCODE = 'P0072';
  END IF;

  IF NOT v_privileged THEN
    -- resolved_by_day_id is written by certify_rods_day only.
    IF NEW.resolved_by_day_id IS DISTINCT FROM OLD.resolved_by_day_id THEN
      RAISE EXCEPTION 'A correction request is closed by the certified log, not by hand.'
        USING ERRCODE = 'P0072';
    END IF;
    IF NOT coalesce(public.is_own_rods_operator(OLD.operator_id), false) THEN
      RAISE EXCEPTION 'Only the driver may answer a correction request.' USING ERRCODE = 'P0073';
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status <> 'open' THEN
      RAISE EXCEPTION 'This correction request has already been resolved.' USING ERRCODE = 'P0074';
    END IF;
    IF NEW.status NOT IN ('actioned','declined') THEN
      RAISE EXCEPTION 'A correction request can only be actioned or declined.' USING ERRCODE = 'P0074';
    END IF;
    IF NEW.status = 'declined' AND coalesce(btrim(NEW.driver_response),'') = '' THEN
      RAISE EXCEPTION 'Declining a correction request requires a written response.' USING ERRCODE = 'P0075';
    END IF;
    NEW.resolved_at := coalesce(NEW.resolved_at, now());
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rods_correction_request_update
  BEFORE UPDATE ON public.rods_correction_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_rods_correction_request_update();

-- 8. Close open requests inside certify_rods_day itself.
CREATE OR REPLACE FUNCTION public.certify_rods_day(_day_id uuid, _legal_name text, _signature_path text, _pdf_path text, _device_info text, p_certification_token uuid, p_changes jsonb, p_signature_validation jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_day public.rods_days;
  v_existing public.rods_days;
  v_orig uuid;
  v_bad int;
  v_cursor int;
  v_missing text[] := '{}';
  v_constraint text;
  v_recompute boolean := false;
  v_off int := 0;
  v_sleeper int := 0;
  v_driving int := 0;
  v_onduty int := 0;
  v_mins int;
  v_item jsonb;
  r record;
BEGIN
  IF p_certification_token IS NULL THEN
    RAISE EXCEPTION 'rods_certification_token_required: A certification token is required.'
      USING ERRCODE = 'P0010';
  END IF;

  SELECT * INTO v_day FROM public.rods_days WHERE id = _day_id FOR UPDATE;
  IF v_day.id IS NULL THEN
    RAISE EXCEPTION 'Log not found.' USING ERRCODE = 'P0011';
  END IF;
  IF coalesce(public.is_own_rods_operator(v_day.operator_id), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Only the driver may certify their own log.' USING ERRCODE = 'P0012';
  END IF;

  SELECT * INTO v_existing FROM public.rods_days
   WHERE certification_token = p_certification_token;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.id = _day_id THEN
      RETURN to_jsonb(v_existing) || jsonb_build_object('replayed', true);
    END IF;
    RAISE EXCEPTION 'rods_token_day_mismatch: This certification token belongs to a different log.'
      USING ERRCODE = 'P0013';
  END IF;

  IF v_day.status <> 'draft' THEN
    RAISE EXCEPTION 'Only a draft log can be certified.' USING ERRCODE = 'P0014';
  END IF;
  IF coalesce(btrim(_legal_name),'') = '' THEN
    RAISE EXCEPTION 'A typed legal name is required.' USING ERRCODE = 'P0015';
  END IF;

  IF lower(btrim(_legal_name)) = ANY (ARRAY[
       'driver', 'unknown', 'operator', 'n/a', 'na', 'unnamed', 'test driver', 'test'
     ]) THEN
    RAISE EXCEPTION 'rods_placeholder_legal_name: "%" is not a driver name. A record of duty status must be certified in the driver''s own legal name.', btrim(_legal_name)
      USING ERRCODE = 'P0032';
  END IF;

  IF v_day.supersedes_day_id IS NOT NULL THEN
    IF coalesce(btrim(v_day.amendment_reason),'') = '' THEN
      RAISE EXCEPTION 'A written reason is required to certify a correction.'
        USING ERRCODE = 'P0016';
    END IF;
    IF coalesce(jsonb_array_length(coalesce(p_changes, '[]'::jsonb)), 0) = 0 THEN
      RAISE EXCEPTION 'An amendment that changed nothing cannot be certified.'
        USING ERRCODE = 'P0017';
    END IF;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_changes) LOOP
      IF coalesce(btrim(v_item->>'field_path'),'') = '' THEN
        RAISE EXCEPTION 'Every change row must name the field that changed.'
          USING ERRCODE = 'P0017';
      END IF;
    END LOOP;
  ELSIF coalesce(jsonb_array_length(coalesce(p_changes, '[]'::jsonb)), 0) > 0 THEN
    RAISE EXCEPTION 'A log that supersedes nothing cannot carry a change record.'
      USING ERRCODE = 'P0018';
  END IF;

  IF v_day.record_source <> 'keyed' THEN
    RAISE EXCEPTION 'This log was filed from an uploaded ELD document and cannot be certified here.'
      USING ERRCODE = 'P0019';
  END IF;

  BEGIN
    SELECT count(*) INTO v_bad FROM public.rods_events
     WHERE rods_day_id = _day_id
       AND (end_minute IS NULL OR duty_status IS NULL
            OR coalesce(btrim(city),'') = '' OR coalesce(btrim(state),'') = '');
    IF v_bad > 0 THEN
      RAISE EXCEPTION 'Cannot certify: % duty-status entr% incomplete (missing an end time, duty status, city or state).',
        v_bad, CASE WHEN v_bad = 1 THEN 'y is' ELSE 'ies are' END
        USING ERRCODE = 'P0020';
    END IF;

    v_recompute := true;
    v_cursor := 0;
    FOR r IN
      SELECT start_minute, end_minute, duty_status FROM public.rods_events
       WHERE rods_day_id = _day_id ORDER BY start_minute
    LOOP
      IF r.start_minute <> v_cursor THEN
        RAISE EXCEPTION 'Cannot certify: the duty-status entries do not form an unbroken 24-hour record.'
          USING ERRCODE = 'P0021';
      END IF;
      IF r.end_minute <= r.start_minute THEN
        RAISE EXCEPTION 'Cannot certify: a duty-status entry ends before it starts.'
          USING ERRCODE = 'P0022';
      END IF;
      v_mins := r.end_minute - r.start_minute;
      IF r.duty_status = 'off_duty' THEN v_off := v_off + v_mins;
      ELSIF r.duty_status = 'sleeper' THEN v_sleeper := v_sleeper + v_mins;
      ELSIF r.duty_status = 'driving' THEN v_driving := v_driving + v_mins;
      ELSE v_onduty := v_onduty + v_mins;
      END IF;
      v_cursor := r.end_minute;
    END LOOP;
    IF v_cursor <> 1440 THEN
      RAISE EXCEPTION 'Cannot certify: % minutes of the 24-hour period are unaccounted for.',
        1440 - v_cursor USING ERRCODE = 'P0023';
    END IF;

    IF v_off <> coalesce(v_day.total_off_duty_minutes, -1)
       OR v_sleeper <> coalesce(v_day.total_sleeper_minutes, -1)
       OR v_driving <> coalesce(v_day.total_driving_minutes, -1)
       OR v_onduty <> coalesce(v_day.total_on_duty_minutes, -1) THEN
      RAISE WARNING 'eld_certify_totals_mismatch day_id=% operator_id=% log_date=% client=(off=%,sleeper=%,driving=%,onduty=%) server=(off=%,sleeper=%,driving=%,onduty=%)',
        v_day.id, v_day.operator_id, v_day.log_date,
        v_day.total_off_duty_minutes, v_day.total_sleeper_minutes,
        v_day.total_driving_minutes, v_day.total_on_duty_minutes,
        v_off, v_sleeper, v_driving, v_onduty;
    END IF;

    IF coalesce(v_day.total_miles_driving_today, -1) < 0 THEN
      v_missing := v_missing || 'total miles driving today'::text;
    END IF;
    IF coalesce(btrim(v_day.truck_number),'') = '' THEN v_missing := v_missing || 'truck / tractor number'::text; END IF;
    IF coalesce(btrim(v_day.carrier_name),'') = '' THEN v_missing := v_missing || 'carrier name'::text; END IF;
    IF coalesce(btrim(v_day.carrier_usdot),'') = '' THEN v_missing := v_missing || 'carrier USDOT number'::text; END IF;
    IF coalesce(btrim(v_day.carrier_mc),'') = '' THEN v_missing := v_missing || 'carrier MC number'::text; END IF;
    IF coalesce(btrim(v_day.main_office_address),'') = '' THEN v_missing := v_missing || 'main office address'::text; END IF;
    IF coalesce(btrim(v_day.home_terminal_address),'') = '' THEN v_missing := v_missing || 'home terminal address'::text; END IF;
    IF coalesce(btrim(v_day.home_terminal_timezone),'') = '' THEN v_missing := v_missing || 'home terminal time zone'::text; END IF;
    IF coalesce(btrim(v_day.from_location),'') = '' THEN v_missing := v_missing || 'from'::text; END IF;
    IF coalesce(btrim(v_day.to_location),'') = '' THEN v_missing := v_missing || 'to'::text; END IF;
    IF coalesce(btrim(v_day.co_driver_name),'') = '' THEN v_missing := v_missing || 'co-driver name'::text; END IF;
    IF coalesce(btrim(v_day.shipping_document_no),'') = '' THEN v_missing := v_missing || 'shipping document number or shipper and commodity'::text; END IF;

    IF array_length(v_missing, 1) > 0 THEN
      RAISE EXCEPTION 'Cannot certify: missing required log header fields: %.', array_to_string(v_missing, ', ')
        USING ERRCODE = 'P0030';
    END IF;
  END;

  PERFORM set_config('rods.privileged','on', true);
  v_orig := v_day.supersedes_day_id;

  IF v_orig IS NOT NULL THEN
    UPDATE public.rods_days
       SET status = 'superseded', locked = true, updated_at = now()
     WHERE id = v_orig;
  END IF;

  BEGIN
    UPDATE public.rods_days
       SET status = 'certified',
           locked = true,
           certified_at = now(),
           certified_by = auth.uid(),
           certification_legal_name = _legal_name,
           certification_signature_path = _signature_path,
           certification_device_info = _device_info,
           certification_token = p_certification_token,
           certification_signature_validation = p_signature_validation,
           pdf_path = COALESCE(_pdf_path, pdf_path),
           total_off_duty_minutes = CASE WHEN v_recompute THEN v_off ELSE total_off_duty_minutes END,
           total_sleeper_minutes  = CASE WHEN v_recompute THEN v_sleeper ELSE total_sleeper_minutes END,
           total_driving_minutes  = CASE WHEN v_recompute THEN v_driving ELSE total_driving_minutes END,
           total_on_duty_minutes  = CASE WHEN v_recompute THEN v_onduty ELSE total_on_duty_minutes END,
           updated_at = now()
     WHERE id = _day_id
    RETURNING * INTO v_day;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'rods_days_certification_token_key' THEN
      SELECT * INTO v_existing FROM public.rods_days
       WHERE certification_token = p_certification_token;
      IF v_existing.id IS NULL OR v_existing.id <> _day_id THEN
        RAISE EXCEPTION 'rods_token_day_mismatch: This certification token belongs to a different log.'
          USING ERRCODE = 'P0013';
      END IF;
      RETURN to_jsonb(v_existing) || jsonb_build_object('replayed', true);
    ELSIF v_constraint = 'rods_days_one_certified_per_date' THEN
      RAISE EXCEPTION 'rods_duplicate_certified_date: A certified log already exists for this driver and date.'
        USING ERRCODE = 'P0031';
    ELSE
      RAISE;
    END IF;
  END;

  IF v_orig IS NOT NULL THEN
    INSERT INTO public.rods_amendments (
      operator_id, rods_day_id, original_day_id, log_date,
      field_path, old_value, new_value, reason, created_by
    )
    SELECT v_day.operator_id, v_day.id, v_orig, v_day.log_date,
           item->>'field_path', item->>'old_value', item->>'new_value',
           btrim(v_day.amendment_reason), auth.uid()
      FROM jsonb_array_elements(p_changes) AS item;
  END IF;

  -- A correction request is closed by the fact of a fresh certification for
  -- that date, not by the driver pressing the right button. Placed inside the
  -- function rather than on a trigger so no future certification path can
  -- bypass it.
  UPDATE public.rods_correction_requests
     SET status = 'actioned',
         resolved_at = now(),
         resolved_by_day_id = v_day.id,
         updated_at = now()
   WHERE operator_id = v_day.operator_id
     AND log_date = v_day.log_date
     AND status = 'open';

  PERFORM set_config('rods.privileged','off', true);
  RETURN to_jsonb(v_day) || jsonb_build_object('replayed', false);
END;
$function$;