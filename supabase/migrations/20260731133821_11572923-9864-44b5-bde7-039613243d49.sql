REVOKE EXECUTE ON FUNCTION public.purge_rods_day(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.purge_rods_day(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.purge_rods_day(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purge_rods_day(uuid, text) TO service_role;

COMMENT ON FUNCTION public.purge_rods_day(uuid, text) IS
  'Permanently removes a rods_days row and its events/amendments. Gate is the EXECUTE grant: service_role only (anon and authenticated are revoked). The in-function caller check is belt-and-braces and accepts both call paths -- PostgREST, where request.jwt.claims->>''role'' is service_role, and a direct pooler/psql connection, where session_user is postgres/supabase_admin/service_role. Every call writes an audit_log row before deleting. 49 CFR 395.8(k)(1) requires six months retention: purge is for demo/test data only.';