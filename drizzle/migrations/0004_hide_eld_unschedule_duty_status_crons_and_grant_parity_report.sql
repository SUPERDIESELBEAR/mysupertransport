-- Owner decision (b), 2026-09-17: the ELD / RODS duty-status feature is HIDDEN.
-- Data, tables, policies, functions, triggers and buckets are all kept. What
-- stops here are the two duty-status cron jobs. The edge functions they call
-- (rods-certification-reminders, process-eld-escalations) are NOT deleted, so
-- re-scheduling restores the behaviour exactly.
--
-- Deliberately NOT unscheduled: daily-inspection-expiry-check (jobid 7). It
-- calls check-inspection-expiry, which emails IRP / Insurance / IFTA / CDL /
-- Medical / Periodic DOT Inspection expiry alerts — inspection and document
-- compliance, which the same decision keeps working.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rods-certification-reminders-hourly') THEN
    PERFORM cron.unschedule('rods-certification-reminders-hourly');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-eld-escalations') THEN
    PERFORM cron.unschedule('process-eld-escalations');
  END IF;
END $$;

-- Grant parity harness fix. public.grant_parity_report() is granted to
-- sandbox_exec_qgxpkcudwjmacrdcyvhj, but psql in the test sandbox connects as
-- sandbox_exec, so src/test/grant-parity-live.test.ts failed with
-- "permission denied for function grant_parity_report". It is the only
-- report-style function in public with this problem (checked: no other
-- public function matching %parity%, %_report or report_% exists).
GRANT EXECUTE ON FUNCTION public.grant_parity_report() TO sandbox_exec;
