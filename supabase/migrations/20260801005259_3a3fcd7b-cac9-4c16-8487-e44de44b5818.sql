-- =====================================================================
-- Function-level EXECUTE audit, group 1 remainder
-- =====================================================================
-- Caught by src/test/definer-live-catalog.test.ts on its first run, which is
-- the point of it existing.
--
-- The preceding migration built its revoke list from a hand-written inventory
-- query that filtered on has_function_privilege('anon', ...) only. These two
-- trigger functions carried EXECUTE for `authenticated` but not `anon`, so
-- they fell outside that filter and survived. The live-catalog guard checks
-- BOTH client roles and found them immediately.
--
-- The lesson is recorded rather than just the fix: an inventory assembled by
-- hand for a one-off migration will miss a case; a standing assertion that
-- re-derives the set from pg_proc on every run will not.
-- =====================================================================

REVOKE EXECUTE ON FUNCTION public.log_inspection_expiry_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_application_expiry_to_binder() FROM PUBLIC, anon, authenticated;