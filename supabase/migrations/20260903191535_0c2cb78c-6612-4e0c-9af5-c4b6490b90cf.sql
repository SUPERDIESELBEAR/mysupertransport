-- 1. get_pei_requests_needing_action: add in-body staff guard + fix grants
CREATE OR REPLACE FUNCTION public.get_pei_requests_needing_action()
RETURNS TABLE (
  request_id UUID,
  application_id UUID,
  applicant_first_name TEXT,
  applicant_last_name TEXT,
  employer_name TEXT,
  employer_contact_email TEXT,
  status public.pei_request_status,
  date_sent TIMESTAMPTZ,
  deadline_date DATE,
  days_since_sent INTEGER,
  action_needed TEXT
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT pr.id, pr.application_id, a.first_name, a.last_name,
    pr.employer_name, pr.employer_contact_email, pr.status, pr.date_sent, pr.deadline_date,
    (CURRENT_DATE - pr.date_sent::date)::INTEGER AS days_since_sent,
    CASE
      WHEN pr.status IN ('sent', 'follow_up_sent', 'final_notice_sent')
        AND (CURRENT_DATE - pr.date_sent::date) >= 30 THEN 'auto_gfe'
      WHEN pr.status IN ('sent', 'follow_up_sent')
        AND (CURRENT_DATE - pr.date_sent::date) >= 25 THEN 'final_notice'
      WHEN pr.status = 'sent'
        AND (CURRENT_DATE - pr.date_sent::date) >= 15 THEN 'follow_up'
      ELSE NULL
    END AS action_needed
  FROM public.pei_requests pr
  JOIN public.applications a ON a.id = pr.application_id
  WHERE pr.status IN ('sent', 'follow_up_sent', 'final_notice_sent')
    AND pr.date_sent IS NOT NULL
    AND (CURRENT_DATE - pr.date_sent::date) >= 15;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_pei_requests_needing_action() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_pei_requests_needing_action() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_pei_requests_needing_action() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pei_requests_needing_action() TO service_role;

-- 2. email_queue_dispatch: cron/system only
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM anon;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO service_role;