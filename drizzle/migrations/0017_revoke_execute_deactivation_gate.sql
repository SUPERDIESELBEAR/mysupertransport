-- A trigger function must never be executable by a client role: Postgres checks
-- EXECUTE at CREATE TRIGGER time only, so revoking costs nothing and closes the
-- anon/authenticated surface the definer guard suites assert on.
-- UNDO: GRANT EXECUTE ON FUNCTION public.enforce_driver_deactivation_permission() TO PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_driver_deactivation_permission() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_driver_deactivation_permission() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_driver_deactivation_permission() FROM authenticated;
