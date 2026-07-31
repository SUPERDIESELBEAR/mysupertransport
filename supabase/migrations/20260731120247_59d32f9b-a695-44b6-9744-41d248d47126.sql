-- Step 5: distinct SQLSTATEs (class P0) for every certification refusal, and a
-- fix for the header-guard array append.
--
-- `v_missing := v_missing || 'literal'` is ambiguous: with an untyped literal
-- Postgres resolves the operator as array || array and tries to parse the
-- literal as an array, raising 22P02. Every missing-header message was
-- therefore unreachable -- the guard fired, but the driver saw a malformed
-- array literal error instead of the field list. Casting each literal to text
-- forces the array || element form.
CREATE OR REPLACE FUNCTION public.certify_rods_day(_day_id uuid, _legal_name text, _signature_path text, _pdf_path text, _device_info text, p_certification_token uuid)
 RETURNS rods_days
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
    RAISE EXCEPTION 'rods_certification_token_required: A certification token is required.'
      USING ERRCODE = 'P0010';
  END IF;

  SELECT * INTO v_day FROM public.rods_days WHERE id = _day_id FOR UPDATE;
  IF v_day.id IS NULL THEN
    RAISE EXCEPTION 'Log not found.' USING ERRCODE = 'P0011';
  END IF;
  IF NOT (public.is_own_rods_operator(v_day.operator_id)) THEN
    RAISE EXCEPTION 'Only the driver may certify their own log.' USING ERRCODE = 'P0012';
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
    RAISE EXCEPTION 'rods_token_day_mismatch: This certification token belongs to a different log.'
      USING ERRCODE = 'P0013';
  END IF;

  IF v_day.status <> 'draft' THEN
    RAISE EXCEPTION 'Only a draft log can be certified.' USING ERRCODE = 'P0014';
  END IF;
  IF coalesce(btrim(_legal_name),'') = '' THEN
    RAISE EXCEPTION 'A typed legal name is required.' USING ERRCODE = 'P0015';
  END IF;

  -- Keyed logs only. An uploaded ELD document has no keyed segments by design.
  IF v_day.record_source <> 'eld_document' THEN

    -- 3a. Segment guard: no incomplete entries.
    SELECT count(*) INTO v_bad FROM public.rods_events
     WHERE rods_day_id = _day_id
       AND (end_minute IS NULL OR duty_status IS NULL
            OR coalesce(btrim(city),'') = '' OR coalesce(btrim(state),'') = '');
    IF v_bad > 0 THEN
      RAISE EXCEPTION 'Cannot certify: % duty-status entr% incomplete (missing an end time, duty status, city or state).',
        v_bad, CASE WHEN v_bad = 1 THEN 'y is' ELSE 'ies are' END
        USING ERRCODE = 'P0020';
    END IF;

    -- 3b. Segment guard: entries must tile 00:00-24:00 with no gaps or overlaps.
    v_cursor := 0;
    FOR r IN
      SELECT start_minute, end_minute FROM public.rods_events
       WHERE rods_day_id = _day_id ORDER BY start_minute
    LOOP
      IF r.start_minute > v_cursor THEN
        RAISE EXCEPTION 'Cannot certify: nothing recorded between minute % and minute % of the day.',
          v_cursor, r.start_minute USING ERRCODE = 'P0021';
      ELSIF r.start_minute < v_cursor THEN
        RAISE EXCEPTION 'Cannot certify: two entries overlap at minute % of the day.',
          r.start_minute USING ERRCODE = 'P0022';
      END IF;
      v_cursor := r.end_minute;
    END LOOP;
    IF v_cursor <> 1440 THEN
      RAISE EXCEPTION 'Cannot certify: % minutes of the 24-hour period are unaccounted for.',
        1440 - v_cursor USING ERRCODE = 'P0023';
    END IF;

    -- 3c. Header guard: 49 CFR 395.8 required fields (12).
    -- total_mileage_today is deliberately excluded: only total miles driving
    -- today is explicitly required, and an unavailable odometer reading must
    -- never make a log uncertifiable. RECAP fields are never validated.
    -- The client checklist in rodsValidation.ts checks the same twelve.
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
        RAISE EXCEPTION 'rods_token_day_mismatch: This certification token belongs to a different log.'
          USING ERRCODE = 'P0013';
      END IF;
      RETURN v_existing;  -- concurrent replay of the same certification
    ELSIF v_constraint = 'rods_days_one_certified_per_date' THEN
      RAISE EXCEPTION 'rods_duplicate_certified_date: A certified log already exists for this driver and date.'
        USING ERRCODE = 'P0031';
    ELSE
      RAISE;
    END IF;
  END;

  PERFORM set_config('rods.privileged','off', true);
  RETURN v_day;
END;
$function$;