-- 1. In-progress segments must be storable; completeness moves to certification.
ALTER TABLE public.rods_events
  ALTER COLUMN end_minute DROP NOT NULL,
  ALTER COLUMN duty_status DROP NOT NULL,
  ALTER COLUMN city DROP NOT NULL,
  ALTER COLUMN state DROP NOT NULL,
  ALTER COLUMN is_short_period DROP NOT NULL,
  ALTER COLUMN is_short_period DROP DEFAULT;

COMMENT ON COLUMN public.rods_events.end_minute IS
  'Null while the driver has not yet entered an end time. Completeness is enforced at certification, not at storage.';
COMMENT ON COLUMN public.rods_events.is_short_period IS
  'Computed from duration; null while end_minute is null. Recomputed on every save.';

-- 2. Make the midnight assumption explicit.
ALTER TABLE public.rods_days
  ADD COLUMN period_start_time time NOT NULL DEFAULT '00:00',
  ADD CONSTRAINT rods_days_period_start_midnight CHECK (period_start_time = '00:00');

COMMENT ON COLUMN public.rods_days.period_start_time IS
  'The 24-hour period start. Constrained to midnight: a carrier-designated non-midnight period under 49 CFR 395.8 would require offsetting both the grid geometry and the 1440-minute coverage math. The constraint makes that assumption explicit rather than untested.';

-- 3. Server-side certification guard.
CREATE OR REPLACE FUNCTION public.certify_rods_day(
  _day_id uuid, _legal_name text, _signature_path text,
  _pdf_path text DEFAULT NULL::text, _device_info text DEFAULT NULL::text
)
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

    -- 3c. Header guard: 49 CFR 395.8 required fields.
    -- total_mileage_today is deliberately excluded: only total miles driving
    -- today is explicitly required, and an unavailable odometer reading must
    -- never make a log uncertifiable. RECAP fields are never validated.
    IF coalesce(v_day.total_miles_driving_today, -1) < 0 THEN
      v_missing := v_missing || 'total miles driving today';
    END IF;
    IF coalesce(btrim(v_day.truck_number),'') = '' THEN v_missing := v_missing || 'truck / tractor number'; END IF;
    IF coalesce(btrim(v_day.carrier_name),'') = '' THEN v_missing := v_missing || 'carrier name'; END IF;
    IF coalesce(btrim(v_day.home_terminal_address),'') = '' THEN v_missing := v_missing || 'home terminal address'; END IF;
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