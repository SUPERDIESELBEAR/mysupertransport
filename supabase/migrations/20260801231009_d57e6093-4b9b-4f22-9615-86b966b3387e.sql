-- Pin the search path to the project convention (public, extensions) plus the
-- schemas each function actually reads.
ALTER FUNCTION public.eld_cron_status() SET search_path = public, extensions, cron;
ALTER FUNCTION public.enforce_eld_notification_immutability() SET search_path = public, extensions;

-- A trigger function is never called directly, and the cron status helper is a
-- service/inspection read. Neither belongs on the client API surface.
REVOKE EXECUTE ON FUNCTION public.eld_cron_status() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.enforce_eld_notification_immutability() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.eld_cron_status() TO service_role;