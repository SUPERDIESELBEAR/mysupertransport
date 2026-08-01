-- Re-authored so the migration set on disk matches the live definitions
-- (pinned search_path, no client EXECUTE). No behavior change.
CREATE OR REPLACE FUNCTION public.eld_cron_status()
 RETURNS TABLE(jobid bigint, jobname text, schedule text, active boolean, runid bigint, status text, return_message text, start_time timestamp with time zone, end_time timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'cron'
AS $function$
  SELECT j.jobid, j.jobname, j.schedule, j.active,
         d.runid, d.status, d.return_message, d.start_time, d.end_time
  FROM cron.job j
  LEFT JOIN LATERAL (
    SELECT r.runid, r.status, r.return_message, r.start_time, r.end_time
    FROM cron.job_run_details r
    WHERE r.jobid = j.jobid
    ORDER BY r.start_time DESC
    LIMIT 10
  ) d ON true
  WHERE j.jobname = 'process-eld-escalations'
    AND (
      public.has_role(auth.uid(), 'management'::app_role)
      OR public.has_role(auth.uid(), 'owner'::app_role)
    )
  ORDER BY d.start_time DESC NULLS LAST;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_eld_notification_immutability()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.is_override IS DISTINCT FROM OLD.is_override THEN
    RAISE EXCEPTION 'is_override is immutable on the ELD notification ledger'
      USING ERRCODE = 'ELD01';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.eld_cron_status() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.enforce_eld_notification_immutability() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.eld_cron_status() TO service_role;