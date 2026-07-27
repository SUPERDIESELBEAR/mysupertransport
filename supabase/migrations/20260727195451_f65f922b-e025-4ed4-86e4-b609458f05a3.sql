CREATE OR REPLACE FUNCTION public.get_pei_queue()
 RETURNS TABLE(request_id uuid, application_id uuid, applicant_first_name text, applicant_last_name text, employer_name text, employer_city text, employer_state text, status pei_request_status, date_sent date, deadline_date date, days_remaining integer, is_overdue boolean, send_method text, staff_notes jsonb, days_since_sent integer, date_response_received date, date_gfe_created date, gfe_reason pei_gfe_reason, pei_archived_at timestamp with time zone, pei_archive_reason text, pei_archived_by_name text, pei_archive_category text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT pr.id, pr.application_id, a.first_name, a.last_name,
    pr.employer_name, pr.employer_city, pr.employer_state,
    pr.status, pr.date_sent::date, pr.deadline_date,
    CASE WHEN pr.deadline_date IS NOT NULL THEN pr.deadline_date - CURRENT_DATE ELSE NULL END,
    CASE WHEN pr.deadline_date IS NOT NULL AND pr.deadline_date < CURRENT_DATE
         AND pr.status NOT IN ('completed', 'gfe_documented') THEN true ELSE false END,
    pr.send_method,
    pr.staff_notes,
    CASE WHEN pr.date_sent IS NOT NULL THEN (CURRENT_DATE - pr.date_sent::date) ELSE NULL END,
    pr.date_response_received::date,
    pr.date_gfe_created::date,
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
$function$;

NOTIFY pgrst, 'reload schema';