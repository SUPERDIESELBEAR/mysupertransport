-- Re-key every named RAISE in RODS/ELD/short-link functions to a unique SQLSTATE.
-- One code = one condition in one function. P0010-P0031 stay exclusive to
-- certify_rods_day. Message text is unchanged throughout.

CREATE OR REPLACE FUNCTION public.enforce_rods_certified_continuity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF OLD.status = 'certified' AND NEW.status <> 'certified' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.rods_days
       WHERE operator_id = NEW.operator_id AND log_date = NEW.log_date
         AND status = 'certified' AND id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'A certified log for % cannot be superseded unless a replacement is certified in the same transaction.', NEW.log_date
        USING ERRCODE = 'P0042';
    END IF;
  END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_rods_day_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('rods.purge', true) = 'on' THEN
      RETURN OLD;
    END IF;

    IF OLD.supersedes_day_id IS NOT NULL
       AND OLD.certified_at IS NULL
       AND OLD.status <> 'certified'
       AND current_setting('rods.discard', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Use discard_rods_amendment() to remove a correction draft.'
        USING ERRCODE = 'P0043';
    END IF;

    IF OLD.certified_at IS NOT NULL OR OLD.status = 'certified' THEN
      RAISE EXCEPTION 'This log is certified and is a federal record. It cannot be deleted.'
        USING ERRCODE = 'P0002';
    END IF;

    IF OLD.locked THEN
      RAISE EXCEPTION 'This log is locked and cannot be deleted.'
        USING ERRCODE = 'P0041';
    END IF;

    RETURN OLD;
  END IF;

  IF OLD.locked AND current_setting('rods.privileged', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'This log is certified and is a federal record. It cannot be changed.'
      USING ERRCODE = 'P0040';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_rods_event_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_locked boolean;
BEGIN
  SELECT locked INTO v_locked FROM public.rods_days
    WHERE id = COALESCE(NEW.rods_day_id, OLD.rods_day_id);
  IF coalesce(v_locked, false)
     AND current_setting('rods.privileged', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'This log is certified and is a federal record. Its duty-status entries cannot be changed.'
      USING ERRCODE = 'P0044';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.discard_rods_amendment(_day_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_day public.rods_days;
BEGIN
  SELECT * INTO v_day FROM public.rods_days WHERE id = _day_id FOR UPDATE;
  IF v_day.id IS NULL THEN
    RAISE EXCEPTION 'Log not found.' USING ERRCODE = 'P0070';
  END IF;
  IF coalesce(public.is_own_rods_operator(v_day.operator_id), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Only the driver may discard their own correction.' USING ERRCODE = 'P0071';
  END IF;
  IF v_day.status <> 'draft' OR v_day.supersedes_day_id IS NULL THEN
    RAISE EXCEPTION 'Only an uncertified correction draft can be discarded.' USING ERRCODE = 'P0072';
  END IF;

  PERFORM set_config('rods.discard', 'on', true);

  DELETE FROM public.rods_events WHERE rods_day_id = _day_id;
  DELETE FROM public.rods_days WHERE id = _day_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_eld_document_day(p_operator_id uuid, p_log_date date, p_source_document_path text, p_carrier jsonb, p_certification_token uuid)
 RETURNS rods_days
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_day public.rods_days;
  v_existing public.rods_days;
  v_constraint text;
BEGIN
  IF p_certification_token IS NULL THEN
    RAISE EXCEPTION 'rods_certification_token_required: A certification token is required.'
      USING ERRCODE = 'P0080';
  END IF;
  IF coalesce(public.is_own_rods_operator(p_operator_id), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Only the driver may file their own log.' USING ERRCODE = 'P0081';
  END IF;
  IF coalesce(btrim(p_source_document_path),'') = '' THEN
    RAISE EXCEPTION 'The uploaded document is missing.' USING ERRCODE = 'P0082';
  END IF;

  SELECT * INTO v_existing FROM public.rods_days
   WHERE certification_token = p_certification_token;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.operator_id = p_operator_id AND v_existing.log_date = p_log_date THEN
      RETURN v_existing;
    END IF;
    RAISE EXCEPTION 'rods_token_day_mismatch: This token belongs to a different log.'
      USING ERRCODE = 'P0083';
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
      RAISE EXCEPTION 'rods_duplicate_certified_date: A certified log already exists for this driver and date.'
        USING ERRCODE = 'P0084';
    ELSE
      RAISE;
    END IF;
  END;

  PERFORM set_config('rods.privileged','off', true);
  RETURN v_day;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_or_create_short_link(_share_token text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_code text;
  v_existing text;
  v_attempt int := 0;
BEGIN
  IF _share_token IS NULL OR length(_share_token) < 8 THEN
    RAISE EXCEPTION 'invalid share token' USING ERRCODE = 'P0050';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'P0051';
  END IF;

  SELECT code INTO v_existing
  FROM public.document_short_links
  WHERE share_token = _share_token;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_code := lower(substring(encode(extensions.gen_random_bytes(8), 'hex') from 1 for 8));
    BEGIN
      INSERT INTO public.document_short_links (code, share_token, created_by)
      VALUES (v_code, _share_token, auth.uid());
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt > 5 THEN
        RAISE;
      END IF;
    END;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_eld_event_driver_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
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
    RAISE EXCEPTION 'This malfunction record is locked. Drivers may only update their own notes.'
      USING ERRCODE = 'P0060';
  END IF;

  IF OLD.notice_uploaded_at IS NOT NULL AND NEW.notice_uploaded_at IS DISTINCT FROM OLD.notice_uploaded_at THEN
    RAISE EXCEPTION 'Notice upload timestamp is immutable once set.' USING ERRCODE = 'P0061';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_eld_suppression_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.escalations_suppressed_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.escalations_suppressed_at IS DISTINCT FROM OLD.escalations_suppressed_at)
  THEN
    IF NEW.escalations_suppressed_reason IS NULL OR btrim(NEW.escalations_suppressed_reason) = '' THEN
      RAISE EXCEPTION 'A written reason is required to pause escalations.' USING ERRCODE = 'P0062';
    END IF;
    IF NEW.escalations_suppressed_until IS NULL THEN
      RAISE EXCEPTION 'An escalation pause must have an expiry date.' USING ERRCODE = 'P0063';
    END IF;
    IF NEW.escalations_suppressed_until > (NEW.escalations_suppressed_at AT TIME ZONE 'UTC')::date + 7 THEN
      RAISE EXCEPTION 'An escalation pause may not exceed 7 days.' USING ERRCODE = 'P0064';
    END IF;
    IF NEW.escalations_suppressed_until < (NEW.escalations_suppressed_at AT TIME ZONE 'UTC')::date THEN
      RAISE EXCEPTION 'An escalation pause expiry may not be in the past.' USING ERRCODE = 'P0065';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;