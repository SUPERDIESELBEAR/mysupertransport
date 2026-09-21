-- 2026-09-21 15:45 UTC — grant-parity harness regression, second occurrence.
--
-- src/test/grant-parity-live.test.ts calls public.grant_parity_report() through
-- the sandbox psql session. That session connects as the BARE role
-- `sandbox_exec` (current_user = session_user = sandbox_exec). Migration 0008
-- granted EXECUTE to both `sandbox_exec` and
-- `sandbox_exec_qgxpkcudwjmacrdcyvhj` and the check passed 3/3 on 2026-09-17.
--
-- Evidence of the regression, read from the live catalog 2026-09-21 15:40 UTC:
--   pg_proc.proacl for grant_parity_report() =
--     {postgres=X/postgres,service_role=X/postgres,
--      sandbox_exec_qgxpkcudwjmacrdcyvhj=X/postgres}
--   has_function_privilege('sandbox_exec', ..., 'EXECUTE') = false
--   zero function ACLs anywhere still name the bare role (`sandbox_exec=` : 0)
--   pg_roles: sandbox_exec oid 35560, sandbox_exec_qgxpkcudwjmacrdcyvhj oid
--     27530 — the bare role is the NEWER of the two, and 221 public tables carry
--     a fresh `sandbox_exec=ar/postgres` table grant the platform re-issues.
-- The function was not recreated (no migration after 0008 touches it) and no
-- migration revokes it, so the grant disappeared because the bare role itself
-- was dropped and recreated by sandbox provisioning: dropping a role strips it
-- from every ACL, and provisioning re-grants tables but not function EXECUTE.
-- That means THIS FIX WILL NOT STICK across a re-provisioned sandbox; it is
-- recorded in the report rather than papered over in the test, which must stay
-- RED when the privilege is missing.
--
-- Never grant this to authenticated, anon or PUBLIC: the report reads every
-- public table's grants.
-- UNDO: REVOKE EXECUTE ON FUNCTION public.grant_parity_report() FROM "sandbox_exec";
GRANT EXECUTE ON FUNCTION public.grant_parity_report() TO "sandbox_exec";
GRANT EXECUTE ON FUNCTION public.grant_parity_report() TO "sandbox_exec_qgxpkcudwjmacrdcyvhj";
REVOKE ALL ON FUNCTION public.grant_parity_report() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_parity_report() FROM anon;
REVOKE ALL ON FUNCTION public.grant_parity_report() FROM authenticated;
