-- Grant-parity harness, second attempt.
--
-- 2026-09-17 2005 pass ran `GRANT EXECUTE ON FUNCTION
-- public.grant_parity_report() TO sandbox_exec;` (migration 0004). Live ACL
-- afterwards still reads only:
--   {postgres=X/postgres,service_role=X/postgres,sandbox_exec_qgxpkcudwjmacrdcyvhj=X/postgres}
-- while the sandbox psql session reports current_user = session_user =
-- sandbox_exec and has_function_privilege(...,'EXECUTE') = false. Both roles
-- exist in pg_roles and neither is a member of the other.
--
-- This grants the bare role with a quoted identifier so no name resolution can
-- rewrite it, and re-states the suffixed role so the ACL is explicit about both
-- names the harness can connect as. Nothing is granted to authenticated, anon
-- or PUBLIC: grant_parity_report() reads every public table's grants.
GRANT EXECUTE ON FUNCTION public.grant_parity_report() TO "sandbox_exec";
GRANT EXECUTE ON FUNCTION public.grant_parity_report() TO "sandbox_exec_qgxpkcudwjmacrdcyvhj";
REVOKE ALL ON FUNCTION public.grant_parity_report() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_parity_report() FROM anon;
REVOKE ALL ON FUNCTION public.grant_parity_report() FROM authenticated;