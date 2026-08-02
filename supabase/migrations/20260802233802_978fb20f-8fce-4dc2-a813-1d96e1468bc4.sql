-- The platform re-widens EXECUTE on newly created public functions to anon and
-- authenticated after a migration applies, so the REVOKE in the creating
-- migration does not survive. Re-revoke explicitly, by role.
REVOKE EXECUTE ON FUNCTION public.enforce_revoked_list_check_append_only() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_revoked_list_check_append_only() TO service_role;

REVOKE EXECUTE ON FUNCTION public.record_revoked_list_check(uuid, text, date, text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_revoked_list_check(uuid, text, date, text, date, date) TO authenticated;