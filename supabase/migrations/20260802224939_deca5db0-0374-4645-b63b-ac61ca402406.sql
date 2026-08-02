-- The §5/§6 functions shipped with Postgres' default PUBLIC EXECUTE grant, so
-- anon could call them. Their internal gates hold (is_retention_admin(auth.uid())
-- is null for anon), but an unauthenticated caller should not reach a definer
-- function at all.

-- Trigger functions: never called directly by anyone.
REVOKE ALL ON FUNCTION public.project_eld_extension_request() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_eld_extension_request_write() FROM PUBLIC, anon, authenticated;

-- Role predicate: read by the retention RPCs, not by clients.
REVOKE ALL ON FUNCTION public.is_retention_admin(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_retention_admin(uuid) TO service_role;

-- Retention RPCs: called by export-retention-archive on a USER-SCOPED client,
-- so `authenticated` must keep EXECUTE — auth.uid() is what their admin gate
-- reads. anon loses it.
REVOKE ALL ON FUNCTION public.get_eld_compliance_timeline(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_eld_compliance_timeline(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.search_retention_archive(uuid[], date, date, text, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_retention_archive(uuid[], date, date, text, uuid, text, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.record_retention_export(text, uuid[], date, date, boolean, integer, integer, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_retention_export(text, uuid[], date, date, boolean, integer, integer, text, jsonb) TO authenticated, service_role;