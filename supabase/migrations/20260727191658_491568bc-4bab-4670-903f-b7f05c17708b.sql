-- 1. New columns on pei_requests
ALTER TABLE public.pei_requests
  ADD COLUMN IF NOT EXISTS send_method text,
  ADD COLUMN IF NOT EXISTS manual_send_logged_by text,
  ADD COLUMN IF NOT EXISTS staff_notes jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. Archive columns on applications
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS pei_archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS pei_archived_by uuid,
  ADD COLUMN IF NOT EXISTS pei_archived_by_name text,
  ADD COLUMN IF NOT EXISTS pei_archive_reason text;

-- 3. Extend allowed event types
ALTER TABLE public.pei_request_events
  DROP CONSTRAINT IF EXISTS pei_request_events_event_type_check;
ALTER TABLE public.pei_request_events
  ADD CONSTRAINT pei_request_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'opened_response_link'::text,
    'opened_release_link'::text,
    'submitted'::text,
    'phone_attempt'::text,
    'manual_send_logged'::text
  ]));

-- 4. Deadline recompute on any date_sent change
CREATE OR REPLACE FUNCTION public.set_pei_deadline()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.date_sent IS NOT NULL
     AND (OLD.date_sent IS NULL OR NEW.date_sent IS DISTINCT FROM OLD.date_sent) THEN
    NEW.deadline_date := (NEW.date_sent::date + INTERVAL '30 days')::date;
  END IF;
  RETURN NEW;
END;
$function$;

-- 5. Queue RPC with archive + aging info
DROP FUNCTION IF EXISTS public.get_pei_queue();
CREATE OR REPLACE FUNCTION public.get_pei_queue()
RETURNS TABLE(
  request_id uuid,
  application_id uuid,
  applicant_first_name text,
  applicant_last_name text,
  employer_name text,
  employer_city text,
  employer_state text,
  status pei_request_status,
  date_sent timestamp with time zone,
  deadline_date date,
  days_remaining integer,
  is_overdue boolean,
  send_method text,
  staff_notes jsonb,
  days_since_sent integer,
  date_response_received timestamp with time zone,
  date_gfe_created timestamp with time zone,
  gfe_reason pei_gfe_reason,
  pei_archived_at timestamp with time zone,
  pei_archive_reason text,
  pei_archived_by_name text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT pr.id, pr.application_id, a.first_name, a.last_name,
    pr.employer_name, pr.employer_city, pr.employer_state,
    pr.status, pr.date_sent, pr.deadline_date,
    CASE WHEN pr.deadline_date IS NOT NULL THEN pr.deadline_date - CURRENT_DATE ELSE NULL END,
    CASE WHEN pr.deadline_date IS NOT NULL AND pr.deadline_date < CURRENT_DATE
         AND pr.status NOT IN ('completed', 'gfe_documented') THEN true ELSE false END,
    pr.send_method,
    pr.staff_notes,
    CASE WHEN pr.date_sent IS NOT NULL THEN (CURRENT_DATE - pr.date_sent::date) ELSE NULL END,
    pr.date_response_received,
    pr.date_gfe_created,
    pr.gfe_reason,
    a.pei_archived_at,
    a.pei_archive_reason,
    a.pei_archived_by_name
  FROM public.pei_requests pr
  JOIN public.applications a ON a.id = pr.application_id
  ORDER BY
    CASE WHEN a.pei_archived_at IS NOT NULL THEN 2
         WHEN pr.status IN ('completed', 'gfe_documented') THEN 1 ELSE 0 END ASC,
    CASE WHEN pr.deadline_date IS NOT NULL THEN pr.deadline_date ELSE '2099-12-31'::date END ASC,
    pr.created_at ASC;
END;
$function$;

-- 6. Archive / restore RPCs
CREATE OR REPLACE FUNCTION public.archive_applicant_pei(_application_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _name text;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) = 0 THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;
  IF length(_reason) > 500 THEN
    RAISE EXCEPTION 'Reason is too long';
  END IF;

  SELECT btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,''))
    INTO _name FROM public.profiles p WHERE p.id = auth.uid();

  UPDATE public.applications
  SET pei_archived_at = now(),
      pei_archived_by = auth.uid(),
      pei_archived_by_name = nullif(_name, ''),
      pei_archive_reason = btrim(_reason)
  WHERE id = _application_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_applicant_pei(_application_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.applications
  SET pei_archived_at = NULL,
      pei_archived_by = NULL,
      pei_archived_by_name = NULL,
      pei_archive_reason = NULL
  WHERE id = _application_id;
END;
$function$;

-- 7. Manual send + phone attempt logging
CREATE OR REPLACE FUNCTION public.log_pei_manual_send(
  _request_id uuid,
  _date_sent timestamptz,
  _method text,
  _note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _name text;
  _prev_status pei_request_status;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _date_sent IS NULL OR _date_sent > now() + INTERVAL '1 day' THEN
    RAISE EXCEPTION 'Send date cannot be in the future';
  END IF;
  IF _method IS NULL OR _method NOT IN ('email_external','fax','mail','phone') THEN
    RAISE EXCEPTION 'Invalid send method';
  END IF;

  SELECT btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,''))
    INTO _name FROM public.profiles p WHERE p.id = auth.uid();

  SELECT status INTO _prev_status FROM public.pei_requests WHERE id = _request_id;

  UPDATE public.pei_requests
  SET date_sent = _date_sent,
      send_method = _method,
      manual_send_logged_by = nullif(_name, ''),
      status = CASE WHEN _prev_status = 'pending' THEN 'sent'::pei_request_status ELSE _prev_status END
  WHERE id = _request_id;

  INSERT INTO public.pei_request_events (pei_request_id, event_type, metadata)
  VALUES (_request_id, 'manual_send_logged', jsonb_build_object(
    'date_sent', _date_sent,
    'method', _method,
    'note', left(coalesce(_note, ''), 1000),
    'staff_name', _name
  ));
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_pei_phone_attempt(
  _request_id uuid,
  _attempt_date timestamptz,
  _spoke_with text,
  _outcome text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _name text;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _attempt_date IS NULL OR _attempt_date > now() + INTERVAL '1 day' THEN
    RAISE EXCEPTION 'Attempt date cannot be in the future';
  END IF;

  SELECT btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,''))
    INTO _name FROM public.profiles p WHERE p.id = auth.uid();

  INSERT INTO public.pei_request_events (pei_request_id, event_type, metadata)
  VALUES (_request_id, 'phone_attempt', jsonb_build_object(
    'attempt_date', _attempt_date,
    'spoke_with', left(coalesce(_spoke_with, ''), 200),
    'outcome', left(coalesce(_outcome, ''), 1000),
    'staff_name', _name
  ));
END;
$function$;

-- 8. Staff notes append
CREATE OR REPLACE FUNCTION public.add_pei_staff_note(_request_id uuid, _note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _name text;
  _out jsonb;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _note IS NULL OR length(btrim(_note)) = 0 THEN
    RAISE EXCEPTION 'Note cannot be empty';
  END IF;
  IF length(_note) > 2000 THEN
    RAISE EXCEPTION 'Note is too long';
  END IF;

  SELECT btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,''))
    INTO _name FROM public.profiles p WHERE p.id = auth.uid();

  UPDATE public.pei_requests
  SET staff_notes = coalesce(staff_notes, '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object(
      'note', btrim(_note),
      'author', coalesce(nullif(_name, ''), 'Staff'),
      'at', now()
    ))
  WHERE id = _request_id
  RETURNING staff_notes INTO _out;

  RETURN _out;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_pei_queue() TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_applicant_pei(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_applicant_pei(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_pei_manual_send(uuid, timestamptz, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_pei_phone_attempt(uuid, timestamptz, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_pei_staff_note(uuid, text) TO authenticated;