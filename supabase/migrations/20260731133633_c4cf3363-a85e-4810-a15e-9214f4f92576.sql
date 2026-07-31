CREATE OR REPLACE FUNCTION public.certify_rods_day(_day_id uuid, _legal_name text, _signature_path text, _pdf_path text, _device_info text, p_certification_token uuid)
 RETURNS rods_days
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

  SELECT * INTO v_existing FROM public.rods_days
   WHERE certification_token = p_certification_token;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.id = _day_id THEN
      RETURN v_existing;
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

  IF v_day.record_source <> 'eld_document' THEN
    SELECT count(*) INTO v_bad FROM public.rods_events
     WHERE rods_day_id = _day_id
       AND (end_minute IS NULL OR duty_status IS NULL
            OR coalesce(btrim(city),'') = '' OR coalesce(btrim(state),'') = '');
    IF v_bad > 0 THEN
      RAISE EXCEPTION 'Cannot certify: % duty-status entr% incomplete (missing an end time, duty status, city or state).',
        v_bad, CASE WHEN v_bad = 1 THEN 'y is' ELSE 'ies are' END
        USING ERRCODE = 'P0020';
    END IF;

    -- Continuity walk. It already visits every segment in order, so summing
    -- the four status totals here is free. The sums become the authoritative
    -- values written below: the client's copies are advisory only.
    v_recompute := true;
    v_cursor := 0;
    FOR r IN
      SELECT start_minute, end_minute, duty_status FROM public.rods_events
       WHERE rods_day_id = _day_id ORDER BY start_minute
    LOOP
      IF r.start_minute > v_cursor THEN
        RAISE EXCEPTION 'Cannot certify: nothing recorded between minute % and minute % of the day.',
          v_cursor, r.start_minute USING ERRCODE = 'P0021';
      ELSIF r.start_minute < v_cursor THEN
        RAISE EXCEPTION 'Cannot certify: two entries overlap at minute % of the day.',
          r.start_minute USING ERRCODE = 'P0022';
      END IF;
      v_mins := r.end_minute - r.start_minute;
      -- Mirrors statusTotals() in src/lib/eld/rodsValidation.ts exactly,
      -- including its "anything else counts as on duty" fallthrough.
      IF r.duty_status = 1 THEN v_off := v_off + v_mins;
      ELSIF r.duty_status = 2 THEN v_sleeper := v_sleeper + v_mins;
      ELSIF r.duty_status = 3 THEN v_driving := v_driving + v_mins;
      ELSE v_onduty := v_onduty + v_mins;
      END IF;
      v_cursor := r.end_minute;
    END LOOP;
    IF v_cursor <> 1440 THEN
      RAISE EXCEPTION 'Cannot certify: % minutes of the 24-hour period are unaccounted for.',
        1440 - v_cursor USING ERRCODE = 'P0023';
    END IF;

    -- Disagreement is never silently swallowed. It means the device and the
    -- server hold different pictures of a record about to become immutable,
    -- and the offline divergence fingerprint is built from these four numbers.
    -- Warn loudly, then write the server's values anyway.
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
           -- eld_document days keep whatever they hold: v_recompute is false
           -- for them, so the recompute never runs and never writes.
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
      RETURN v_existing;
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

COMMENT ON COLUMN public.rods_days.total_off_duty_minutes IS
  'Server-computed sum of off-duty (status 1) minutes from rods_events, written authoritatively by certify_rods_day during its continuity walk. Not rendered anywhere: the PDF (renderRodsDay) and the roadside SVG (RoadsideDayRender) both recompute from events, as does the editor''s on-screen totals strip. Sole consumer is the offline divergence fingerprint (src/lib/eld/offline/divergence.ts, compareKeyedDay), which compares the device''s cached copy of a certified day against the server''s copy and raises a divergence when they differ. Do not drop. Left untouched for record_source = ''eld_document'' days, which have no events.';

COMMENT ON COLUMN public.rods_days.total_sleeper_minutes IS
  'Server-computed sum of sleeper-berth (status 2) minutes from rods_events, written authoritatively by certify_rods_day. Not rendered anywhere; sole consumer is the offline divergence fingerprint (src/lib/eld/offline/divergence.ts, compareKeyedDay). Do not drop. Left untouched for record_source = ''eld_document'' days.';

COMMENT ON COLUMN public.rods_days.total_driving_minutes IS
  'Server-computed sum of driving (status 3) minutes from rods_events, written authoritatively by certify_rods_day. Not rendered anywhere; sole consumer is the offline divergence fingerprint (src/lib/eld/offline/divergence.ts, compareKeyedDay). Do not drop. Left untouched for record_source = ''eld_document'' days.';

COMMENT ON COLUMN public.rods_days.total_on_duty_minutes IS
  'Server-computed sum of on-duty-not-driving (status 4, and any other value, mirroring statusTotals()) minutes from rods_events, written authoritatively by certify_rods_day. Not rendered anywhere; sole consumer is the offline divergence fingerprint (src/lib/eld/offline/divergence.ts, compareKeyedDay). Do not drop. Left untouched for record_source = ''eld_document'' days.';