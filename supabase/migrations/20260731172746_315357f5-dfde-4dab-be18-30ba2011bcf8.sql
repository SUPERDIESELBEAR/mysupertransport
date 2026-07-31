-- 1) certify_rods_day: additive `replayed` flag on the returned row.
DROP FUNCTION IF EXISTS public.certify_rods_day(uuid, text, text, text, text, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.certify_rods_day(
  _day_id uuid,
  _legal_name text,
  _signature_path text,
  _pdf_path text,
  _device_info text,
  p_certification_token uuid,
  p_changes jsonb DEFAULT '[]'::jsonb
)
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

  -- Replay: the same token already certified this same log. The call is a
  -- no-op and says so, so the client can tell the driver that their earlier
  -- certification (and the signature they gave then) is what stands.
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

  PERFORM set_config('rods.privileged','off', true);
  RETURN to_jsonb(v_day) || jsonb_build_object('replayed', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.certify_rods_day(uuid, text, text, text, text, uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.certify_rods_day(uuid, text, text, text, text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.certify_rods_day(uuid, text, text, text, text, uuid, jsonb) TO service_role;

-- 2) purge_rods_day returns the row-owned artifact paths so the caller can
--    delete exactly those objects through the Storage API. Deleting from
--    storage.objects in SQL is blocked by storage.protect_delete(), and a
--    prefix sweep would take a sibling day's artifacts with it: an amendment
--    and its original share a log_date, so .../<operator>/<log_date>/ is NOT
--    a safe unit of deletion. Explicit row-owned paths only.
DROP FUNCTION IF EXISTS public.purge_rods_day(uuid, text);

CREATE OR REPLACE FUNCTION public.purge_rods_day(_day_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_day public.rods_days;
  v_claim_role text;
  v_allowed boolean;
  v_audit_id uuid;
  v_paths text[] := '{}';
BEGIN
  BEGIN
    v_claim_role := current_setting('request.jwt.claims', true)::json ->> 'role';
  EXCEPTION WHEN others THEN
    v_claim_role := NULL;
  END;

  -- coalesce is load-bearing. Written as `NOT (v_claim_role = 'service_role'
  -- OR session_user IN (...))`, a NULL claim made the whole predicate NULL,
  -- the IF never fired, and the gate failed OPEN for every caller holding
  -- EXECUTE. The check must be positive: refuse unless the caller is proven
  -- to be the service role.
  v_allowed := coalesce(v_claim_role = 'service_role', false)
            OR coalesce(session_user IN ('postgres', 'supabase_admin', 'service_role'), false);

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'purge_rods_day may only be called by the service role.'
      USING ERRCODE = '42501';
  END IF;

  IF coalesce(btrim(_reason), '') = '' OR length(btrim(_reason)) < 12 THEN
    RAISE EXCEPTION 'A written reason of at least 12 characters is required to purge a record of duty status.';
  END IF;

  SELECT * INTO v_day FROM public.rods_days WHERE id = _day_id FOR UPDATE;
  IF v_day.id IS NULL THEN
    RAISE EXCEPTION 'Log not found.';
  END IF;

  -- Only what this row owns. Never a prefix.
  IF coalesce(btrim(v_day.pdf_path), '') <> '' THEN
    v_paths := v_paths || v_day.pdf_path;
  END IF;
  IF coalesce(btrim(v_day.certification_signature_path), '') <> '' THEN
    v_paths := v_paths || v_day.certification_signature_path;
  END IF;
  IF coalesce(btrim(v_day.source_document_path), '') <> '' THEN
    v_paths := v_paths || v_day.source_document_path;
  END IF;

  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (
    auth.uid(),
    coalesce(v_claim_role, session_user),
    'rods_day_purged',
    'rods_day',
    v_day.id,
    coalesce(v_day.log_date::text, '(no date)'),
    jsonb_build_object(
      'reason', btrim(_reason),
      'operator_id', v_day.operator_id,
      'log_date', v_day.log_date,
      'status', v_day.status,
      'certified_at', v_day.certified_at,
      'record_source', v_day.record_source,
      'supersedes_day_id', v_day.supersedes_day_id,
      'locked', v_day.locked,
      'storage_paths', to_jsonb(v_paths),
      'cfr_note', '49 CFR 395.8(k)(1) requires six months retention'
    )
  )
  RETURNING id INTO v_audit_id;

  PERFORM set_config('rods.purge', 'on', true);
  PERFORM set_config('rods.privileged', 'on', true);

  DELETE FROM public.rods_events WHERE rods_day_id = _day_id;
  DELETE FROM public.rods_amendments WHERE rods_day_id = _day_id;
  DELETE FROM public.rods_days WHERE id = _day_id;

  RETURN jsonb_build_object(
    'day_id', _day_id,
    'audit_id', v_audit_id,
    'storage_paths', to_jsonb(v_paths)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.purge_rods_day(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.purge_rods_day(uuid, text) TO service_role;

-- Records the outcome of the caller's Storage API deletion against the audit
-- row the purge wrote. Failures are visible and never block the purge.
CREATE OR REPLACE FUNCTION public.record_rods_purge_storage_result(
  _audit_id uuid,
  _removed text[],
  _failed jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_claim_role text;
BEGIN
  BEGIN
    v_claim_role := current_setting('request.jwt.claims', true)::json ->> 'role';
  EXCEPTION WHEN others THEN
    v_claim_role := NULL;
  END;

  IF NOT (coalesce(v_claim_role = 'service_role', false)
          OR coalesce(session_user IN ('postgres', 'supabase_admin', 'service_role'), false)) THEN
    RAISE EXCEPTION 'record_rods_purge_storage_result may only be called by the service role.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.audit_log
     SET metadata = metadata
                 || jsonb_build_object(
                      'storage_removed', to_jsonb(coalesce(_removed, '{}'::text[])),
                      'storage_failed', coalesce(_failed, '[]'::jsonb)
                    )
   WHERE id = _audit_id
     AND action = 'rods_day_purged';
END;
$function$;

REVOKE ALL ON FUNCTION public.record_rods_purge_storage_result(uuid, text[], jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.record_rods_purge_storage_result(uuid, text[], jsonb) TO service_role;