CREATE OR REPLACE FUNCTION public.get_pei_queue()
RETURNS TABLE(request_id uuid, application_id uuid, applicant_first_name text, applicant_last_name text, employer_name text, employer_city text, employer_state text, status pei_request_status, date_sent timestamp with time zone, deadline_date date, days_remaining integer, is_overdue boolean)
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
         AND pr.status NOT IN ('completed', 'gfe_documented') THEN true ELSE false END
  FROM public.pei_requests pr
  JOIN public.applications a ON a.id = pr.application_id
  ORDER BY
    CASE WHEN pr.status IN ('completed', 'gfe_documented') THEN 1 ELSE 0 END ASC,
    CASE WHEN pr.deadline_date IS NOT NULL THEN pr.deadline_date ELSE '2099-12-31'::date END ASC,
    pr.created_at ASC;
END;
$function$;