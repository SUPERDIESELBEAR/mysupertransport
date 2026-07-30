-- 1. Certification token column + unique index
ALTER TABLE public.rods_days ADD COLUMN IF NOT EXISTS certification_token uuid;

CREATE UNIQUE INDEX IF NOT EXISTS rods_days_certification_token_key
  ON public.rods_days (certification_token);

COMMENT ON COLUMN public.rods_days.certification_token IS
  'Client-generated idempotency key for the certification that produced this row. Unique across all rows via rods_days_certification_token_key. Both the online and offline certification paths supply it, so a replayed certification is a no-op instead of a duplicate federal record.';

-- 2. certify_rods_day, tokened. The old signature is dropped: there must be
--    exactly one certification code path.
DROP FUNCTION IF EXISTS public.certify_rods_day(uuid, text, text, text, text);

CREATE OR REPLACE FUNCTION public.certify_rods_day(
  _day_id uuid,
  _legal_name text,
  _signature_path text,
  _pdf_path text,
  _device_info text,
  p_certification_token uuid
)
RETURNS public.rods_days
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_day public.rods_days;
  v_existing public.rods_days;
  v_orig uuid;
  v_bad int;
  v_cursor int;
  v_missing text[] := '{}';
  v_constraint text;
  r record;
BEGIN
  IF p_certification_token IS NULL THEN
    RAISE EXCEPTION 'rods_certification_token_required: A certification token is required.';
  END IF;

  SELECT * INTO v_day FROM public.rods_days WHERE id = _day_id FOR UPDATE;
  IF v_day.id IS NULL THEN RAISE EXCEPTION 'Log not found.'; END IF;
  IF NOT (public.is_own_rods_operator(v_day.operator_id)) THEN
    RAISE EXCEPTION 'Only the driver may certify their own log.';
  END IF;

  -- Token check runs AFTER the row lock and BEFORE the status guard. A replay
  -- that lost a race would otherwise see status = 'certified' and be reported
  -- to the driver as a failure for a day that certified perfectly.
  SELECT * INTO v_existing FROM public.rods_days
   WHERE certification_token = p_certification_token;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.id = _day_id THEN
      RETURN v_existing;  -- idempotent replay, success
    END IF;
    -- A token presented against a different day is a client bug. Returning the
    -- other day's row would hand back a wrong federal record.
    RAISE EXCEPTION 'rods_token_day_mismatch: This certification token belongs to a different log.';
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
    -- The client checklist in rodsValidation.ts checks the same twelve.
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
           pdf_path = COALESCE(_pdf_path, pdf_path),
           updated_at = now()
     WHERE id = _day_id
    RETURNING * INTO v_day;
  EXCEPTION WHEN unique_violation THEN
    -- Two unique indexes can raise 23505 here and they mean opposite things.
    -- Disambiguate by constraint name so the client never sees a raw 23505 and
    -- never has to parse constraint names to tell a harmless replay from a
    -- genuine duplicate-date conflict.
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'rods_days_certification_token_key' THEN
      SELECT * INTO v_existing FROM public.rods_days
       WHERE certification_token = p_certification_token;
      IF v_existing.id IS NULL OR v_existing.id <> _day_id THEN
        RAISE EXCEPTION 'rods_token_day_mismatch: This certification token belongs to a different log.';
      END IF;
      RETURN v_existing;  -- concurrent replay of the same certification
    ELSIF v_constraint = 'rods_days_one_certified_per_date' THEN
      RAISE EXCEPTION 'rods_duplicate_certified_date: A certified log already exists for this driver and date.';
    ELSE
      RAISE;
    END IF;
  END;

  PERFORM set_config('rods.privileged','off', true);
  RETURN v_day;
END;
$function$;

-- 3. Filing an uploaded ELD log becomes an RPC, token-protected, so the offline
--    queue can replay it safely. The client insert it replaces had no idempotency.
CREATE OR REPLACE FUNCTION public.create_eld_document_day(
  p_operator_id uuid,
  p_log_date date,
  p_source_document_path text,
  p_carrier jsonb,
  p_certification_token uuid
)
RETURNS public.rods_days
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_day public.rods_days;
  v_existing public.rods_days;
  v_constraint text;
BEGIN
  IF p_certification_token IS NULL THEN
    RAISE EXCEPTION 'rods_certification_token_required: A certification token is required.';
  END IF;
  IF NOT public.is_own_rods_operator(p_operator_id) THEN
    RAISE EXCEPTION 'Only the driver may file their own log.';
  END IF;
  IF coalesce(btrim(p_source_document_path),'') = '' THEN
    RAISE EXCEPTION 'The uploaded document is missing.';
  END IF;

  SELECT * INTO v_existing FROM public.rods_days
   WHERE certification_token = p_certification_token;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.operator_id = p_operator_id AND v_existing.log_date = p_log_date THEN
      RETURN v_existing;  -- idempotent replay
    END IF;
    RAISE EXCEPTION 'rods_token_day_mismatch: This token belongs to a different log.';
  END IF;

  PERFORM set_config('rods.privileged','on', true);

  BEGIN
    INSERT INTO public.rods_days (
      operator_id, log_date, record_source, status, locked, is_reconstructed,
      source_document_path, certified_at, certification_token,
      carrier_name, carrier_usdot, carrier_mc,
      main_office_address, home_terminal_address, home_terminal_timezone
    ) VALUES (
      p_operator_id, p_log_date, 'eld_document', 'certified', true, false,
      p_source_document_path, now(), p_certification_token,
      p_carrier->>'carrier_name', p_carrier->>'carrier_usdot', p_carrier->>'carrier_mc',
      p_carrier->>'main_office_address', p_carrier->>'home_terminal_address',
      p_carrier->>'home_terminal_timezone'
    ) RETURNING * INTO v_day;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'rods_days_certification_token_key' THEN
      SELECT * INTO v_existing FROM public.rods_days
       WHERE certification_token = p_certification_token;
      IF v_existing.id IS NULL THEN RAISE; END IF;
      RETURN v_existing;
    ELSIF v_constraint = 'rods_days_one_certified_per_date' THEN
      RAISE EXCEPTION 'rods_duplicate_certified_date: A certified log already exists for this driver and date.';
    ELSE
      RAISE;
    END IF;
  END;

  PERFORM set_config('rods.privileged','off', true);
  RETURN v_day;
END;
$function$;

-- 4. replace_rods_document, tokened the same way.
DROP FUNCTION IF EXISTS public.replace_rods_document(uuid, text, text);

CREATE OR REPLACE FUNCTION public.replace_rods_document(
  _day_id uuid,
  _new_path text,
  _reason text,
  p_certification_token uuid
)
RETURNS public.rods_days
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old public.rods_days;
  v_new public.rods_days;
  v_existing public.rods_days;
  v_constraint text;
BEGIN
  IF p_certification_token IS NULL THEN
    RAISE EXCEPTION 'rods_certification_token_required: A certification token is required.';
  END IF;

  SELECT * INTO v_old FROM public.rods_days WHERE id = _day_id FOR UPDATE;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'Log not found.'; END IF;
  IF NOT public.is_own_rods_operator(v_old.operator_id) THEN
    RAISE EXCEPTION 'Only the driver may replace their own document.';
  END IF;

  SELECT * INTO v_existing FROM public.rods_days
   WHERE certification_token = p_certification_token;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.supersedes_day_id = _day_id THEN
      RETURN v_existing;  -- idempotent replay
    END IF;
    RAISE EXCEPTION 'rods_token_day_mismatch: This token belongs to a different log.';
  END IF;

  IF v_old.record_source <> 'eld_document' THEN
    RAISE EXCEPTION 'Only an uploaded ELD document can be replaced. Keyed logs are amended.';
  END IF;
  IF v_old.status <> 'certified' THEN RAISE EXCEPTION 'This document has already been replaced.'; END IF;
  IF coalesce(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'A written reason is required.'; END IF;
  IF coalesce(btrim(_new_path),'') = '' THEN RAISE EXCEPTION 'The replacement document is missing.'; END IF;

  PERFORM set_config('rods.privileged','on', true);

  UPDATE public.rods_days SET status = 'superseded', updated_at = now() WHERE id = v_old.id;

  BEGIN
    INSERT INTO public.rods_days (
      operator_id, log_date, record_source, status, locked, is_reconstructed,
      supersedes_day_id, amendment_reason,
      carrier_name, carrier_usdot, carrier_mc, main_office_address,
      home_terminal_address, home_terminal_timezone, truck_number,
      trailer_numbers, co_driver_name, shipping_document_no, from_location, to_location,
      total_miles_driving_today, total_mileage_today,
      source_document_path, certified_at, certified_by, certification_token
    ) VALUES (
      v_old.operator_id, v_old.log_date, 'eld_document', 'certified', true, false,
      v_old.id, _reason,
      v_old.carrier_name, v_old.carrier_usdot, v_old.carrier_mc, v_old.main_office_address,
      v_old.home_terminal_address, v_old.home_terminal_timezone, v_old.truck_number,
      v_old.trailer_numbers, v_old.co_driver_name, v_old.shipping_document_no,
      v_old.from_location, v_old.to_location,
      v_old.total_miles_driving_today, v_old.total_mileage_today,
      _new_path, now(), auth.uid(), p_certification_token
    ) RETURNING * INTO v_new;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'rods_days_certification_token_key' THEN
      SELECT * INTO v_existing FROM public.rods_days
       WHERE certification_token = p_certification_token;
      IF v_existing.id IS NULL THEN RAISE; END IF;
      RETURN v_existing;
    ELSIF v_constraint = 'rods_days_one_certified_per_date' THEN
      RAISE EXCEPTION 'rods_duplicate_certified_date: A certified log already exists for this driver and date.';
    ELSE
      RAISE;
    END IF;
  END;

  INSERT INTO public.rods_amendments (
    operator_id, rods_day_id, original_day_id, log_date,
    field_path, old_value, new_value, reason, created_by
  ) VALUES (
    v_old.operator_id, v_new.id, v_old.id, v_old.log_date,
    'source_document_path', v_old.source_document_path, _new_path, _reason, auth.uid()
  );

  PERFORM set_config('rods.privileged','off', true);
  RETURN v_new;
END;
$function$;