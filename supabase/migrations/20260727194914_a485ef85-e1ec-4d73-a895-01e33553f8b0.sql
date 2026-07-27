ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS pei_archive_category text;
UPDATE public.applications SET pei_archive_category = 'not_hired' WHERE pei_archived_at IS NOT NULL;
CREATE OR REPLACE FUNCTION public.archive_applicant_pei(
  _application_id uuid,
  _reason text,
  _archive_category text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF _archive_category IS NULL OR _archive_category NOT IN ('hired', 'not_hired') THEN
    RAISE EXCEPTION 'Archive category must be hired or not_hired';
  END IF;

  SELECT btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,''))
    INTO _name FROM public.profiles p WHERE p.id = auth.uid();

  UPDATE public.applications
  SET pei_archived_at = now(),
      pei_archived_by = auth.uid(),
      pei_archived_by_name = nullif(_name, ''),
      pei_archive_reason = btrim(_reason),
      pei_archive_category = _archive_category
  WHERE id = _application_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_applicant_pei(_application_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.applications
  SET pei_archived_at = NULL,
      pei_archived_by = NULL,
      pei_archived_by_name = NULL,
      pei_archive_reason = NULL,
      pei_archive_category = NULL
  WHERE id = _application_id;
END;
$$;

DROP FUNCTION IF EXISTS public.get_pei_queue();
CREATE FUNCTION public.get_pei_queue()
RETURNS TABLE (
  request_id uuid,
  application_id uuid,
  applicant_first_name text,
  applicant_last_name text,
  employer_name text,
  employer_city text,
  employer_state text,
  status public.pei_request_status,
  date_sent date,
  deadline_date date,
  days_remaining integer,
  is_overdue boolean,
  send_method text,
  staff_notes jsonb,
  days_since_sent integer,
  date_response_received date,
  date_gfe_created date,
  gfe_reason public.pei_gfe_reason,
  pei_archived_at timestamp with time zone,
  pei_archive_reason text,
  pei_archived_by_name text,
  pei_archive_category text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    a.pei_archived_by_name,
    a.pei_archive_category
  FROM public.pei_requests pr
  JOIN public.applications a ON a.id = pr.application_id
  ORDER BY
    CASE WHEN a.pei_archived_at IS NOT NULL THEN 2
         WHEN pr.status IN ('completed', 'gfe_documented') THEN 1 ELSE 0 END ASC,
    CASE WHEN pr.deadline_date IS NOT NULL THEN pr.deadline_date ELSE '2099-12-31'::date END ASC,
    pr.created_at ASC;
END;
$$;