-- 1. is_override: separates evidence rows from verification artifacts.
ALTER TABLE public.eld_malfunction_notifications
  ADD COLUMN IF NOT EXISTS is_override boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.eld_malfunction_notifications.is_override IS
  'True when the row was produced by a run with a nowOverride or channel override. Immutable after insert. The console timeliness column reads only is_override = false rows.';

COMMENT ON COLUMN public.eld_malfunction_notifications.day_number IS
  'Semantics vary by notification_type: escalation_day = the rung (1-8); extension_prompt = the day the one-time prompt happened to fire, NOT a rung; ack_overdue = NULL (the 24h/72h step lives in the reason text). Rung queries MUST filter notification_type = ''escalation_day''.';

-- 2. Immutability. Same treatment as record_source / is_demo: no privileged
-- exemption path, not for service_role, not for any staff role.
CREATE OR REPLACE FUNCTION public.enforce_eld_notification_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_override IS DISTINCT FROM OLD.is_override THEN
    RAISE EXCEPTION 'is_override is immutable on the ELD notification ledger'
      USING ERRCODE = 'ELD01';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_eld_notification_immutability ON public.eld_malfunction_notifications;
CREATE TRIGGER trg_eld_notification_immutability
  BEFORE UPDATE ON public.eld_malfunction_notifications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_eld_notification_immutability();

-- 3. Append-only, explicitly: revoke UPDATE/DELETE from API roles.
REVOKE UPDATE, DELETE ON public.eld_malfunction_notifications FROM authenticated;
REVOKE UPDATE, DELETE ON public.eld_malfunction_notifications FROM anon;
GRANT SELECT, INSERT ON public.eld_malfunction_notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eld_malfunction_notifications TO service_role;

-- 4. Cron observability for the §3 console (the app role cannot read the cron schema).
CREATE OR REPLACE FUNCTION public.eld_cron_status()
RETURNS TABLE (
  jobid bigint,
  jobname text,
  schedule text,
  active boolean,
  runid bigint,
  status text,
  return_message text,
  start_time timestamptz,
  end_time timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, cron
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.eld_cron_status() FROM public;
GRANT EXECUTE ON FUNCTION public.eld_cron_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.eld_cron_status() TO service_role;