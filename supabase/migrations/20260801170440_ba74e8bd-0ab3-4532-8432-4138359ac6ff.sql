-- HEIC upload path (Pass B §6): display copy for uploaded ELD documents.
--
-- pdf-lib cannot embed HEIC and HEIC is the iPhone camera default, so a
-- photographed ELD screen breaks the officer email merge. The device converts
-- to JPEG at upload where it can; these columns record the result.
--
-- display_conversion_failed means "conversion was ATTEMPTED and FAILED", not
-- "no display copy exists". A PDF or non-image is never converted, so
-- (false, NULL) is a legal and common pairing.

ALTER TABLE public.rods_days
  ADD COLUMN IF NOT EXISTS display_document_path text,
  ADD COLUMN IF NOT EXISTS display_conversion_failed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.rods_days.display_document_path IS
  'Display-only JPEG re-encode of source_document_path, produced on the driver device at upload. The original at source_document_path remains the record. NULL when nothing needed converting (PDF) or conversion failed.';
COMMENT ON COLUMN public.rods_days.display_conversion_failed IS
  'The device attempted a decode/re-encode of an uploaded image and could not. NOT the same as "no display copy": a PDF is never converted and leaves this false with a NULL display path.';

-- ---------------------------------------------------------------------------
-- Coherence. Storage-object existence is not assertable from Postgres; the
-- read path falls back to the original when the display object will not fetch.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_rods_day_source_document()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.record_source = 'eld_document'
     AND coalesce(btrim(NEW.source_document_path), '') = '' THEN
    RAISE EXCEPTION 'A log filed from an uploaded ELD document must reference that document.'
      USING ERRCODE = 'P0046';
  END IF;

  IF NEW.record_source <> 'eld_document'
     AND coalesce(btrim(NEW.display_document_path), '') <> '' THEN
    RAISE EXCEPTION 'Only a log filed from an uploaded ELD document can carry a display copy.'
      USING ERRCODE = 'P0047';
  END IF;

  IF NEW.display_conversion_failed
     AND coalesce(btrim(NEW.display_document_path), '') <> '' THEN
    RAISE EXCEPTION 'A log marked as failed conversion cannot also carry a display copy.'
      USING ERRCODE = 'P0048';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_rods_day_source_document() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Immutability. No rods.privileged exemption, exactly as record_source.
-- Safe against replace_rods_document, whose only UPDATE on rods_days is
--   UPDATE public.rods_days SET status='superseded', updated_at=now() ...
-- which touches neither column, so IS DISTINCT FROM is false regardless of the
-- guc. A corrected display copy means a new row via replace_rods_document.
-- ---------------------------------------------------------------------------
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

  -- Checked before the lock test and with no privileged escape hatch: the
  -- provenance of a record of duty status is fixed when it is filed.
  IF NEW.record_source IS DISTINCT FROM OLD.record_source THEN
    RAISE EXCEPTION 'How this log was recorded cannot be changed after it is filed.'
      USING ERRCODE = 'P0045';
  END IF;

  -- Same treatment, same reasoning: what the officer is shown for a filed day
  -- is fixed when it is filed.
  IF NEW.display_document_path IS DISTINCT FROM OLD.display_document_path
     OR NEW.display_conversion_failed IS DISTINCT FROM OLD.display_conversion_failed THEN
    RAISE EXCEPTION 'The display copy of a filed log cannot be changed. File a replacement document instead.'
      USING ERRCODE = 'P0049';
  END IF;

  IF OLD.locked AND current_setting('rods.privileged', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'This log is certified and is a federal record. It cannot be changed.'
      USING ERRCODE = 'P0040';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Filing. The client insert is retired in favour of this RPC, so the guards it
-- carries (own-operator, token idempotency, non-blank path) apply to every
-- filed document day.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_eld_document_day(uuid, date, text, jsonb, uuid);

CREATE FUNCTION public.create_eld_document_day(
  p_operator_id uuid,
  p_log_date date,
  p_source_document_path text,
  p_carrier jsonb,
  p_certification_token uuid,
  p_display_document_path text DEFAULT NULL,
  p_display_conversion_failed boolean DEFAULT false
)
RETURNS rods_days
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_day public.rods_days;
  v_existing public.rods_days;
  v_constraint text;
  v_display text := nullif(btrim(coalesce(p_display_document_path, '')), '');
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
      source_document_path, display_document_path, display_conversion_failed,
      certified_at, certification_token,
      carrier_name, carrier_usdot, carrier_mc,
      main_office_address, home_terminal_address, home_terminal_timezone
    ) VALUES (
      p_operator_id, p_log_date, 'eld_document', 'certified', true, false,
      p_source_document_path, v_display, coalesce(p_display_conversion_failed, false),
      now(), p_certification_token,
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

REVOKE ALL ON FUNCTION public.create_eld_document_day(uuid, date, text, jsonb, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_eld_document_day(uuid, date, text, jsonb, uuid, text, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- Replacement carries its own display copy.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.replace_rods_document(uuid, text, text, uuid);

CREATE FUNCTION public.replace_rods_document(
  _day_id uuid,
  _new_path text,
  _reason text,
  p_certification_token uuid,
  p_display_document_path text DEFAULT NULL,
  p_display_conversion_failed boolean DEFAULT false
)
RETURNS rods_days
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_old public.rods_days;
  v_new public.rods_days;
  v_existing public.rods_days;
  v_constraint text;
  v_display text := nullif(btrim(coalesce(p_display_document_path, '')), '');
BEGIN
  IF p_certification_token IS NULL THEN
    RAISE EXCEPTION 'rods_certification_token_required: A certification token is required.';
  END IF;

  SELECT * INTO v_old FROM public.rods_days WHERE id = _day_id FOR UPDATE;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'Log not found.'; END IF;
  IF coalesce(public.is_own_rods_operator(v_old.operator_id), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Only the driver may replace their own document.';
  END IF;

  SELECT * INTO v_existing FROM public.rods_days
   WHERE certification_token = p_certification_token;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.supersedes_day_id = _day_id THEN
      RETURN v_existing;
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

  -- Touches status and updated_at only. The display columns are deliberately
  -- absent: they are immutable with no privileged exemption.
  UPDATE public.rods_days SET status = 'superseded', updated_at = now() WHERE id = v_old.id;

  BEGIN
    INSERT INTO public.rods_days (
      operator_id, log_date, record_source, status, locked, is_reconstructed,
      supersedes_day_id, amendment_reason,
      carrier_name, carrier_usdot, carrier_mc, main_office_address,
      home_terminal_address, home_terminal_timezone, truck_number,
      trailer_numbers, co_driver_name, shipping_document_no, from_location, to_location,
      total_miles_driving_today, total_mileage_today,
      source_document_path, display_document_path, display_conversion_failed,
      certified_at, certified_by, certification_token
    ) VALUES (
      v_old.operator_id, v_old.log_date, 'eld_document', 'certified', true, false,
      v_old.id, _reason,
      v_old.carrier_name, v_old.carrier_usdot, v_old.carrier_mc, v_old.main_office_address,
      v_old.home_terminal_address, v_old.home_terminal_timezone, v_old.truck_number,
      v_old.trailer_numbers, v_old.co_driver_name, v_old.shipping_document_no,
      v_old.from_location, v_old.to_location,
      v_old.total_miles_driving_today, v_old.total_mileage_today,
      _new_path, v_display, coalesce(p_display_conversion_failed, false),
      now(), auth.uid(), p_certification_token
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

REVOKE ALL ON FUNCTION public.replace_rods_document(uuid, text, text, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_rods_document(uuid, text, text, uuid, text, boolean) TO authenticated;