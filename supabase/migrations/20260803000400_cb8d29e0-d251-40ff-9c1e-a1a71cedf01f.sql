-- Re-assert revokes that the platform's post-migration grant step overrode.
REVOKE ALL ON FUNCTION public.discard_rods_amendment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.discard_rods_amendment(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.log_ica_event(text, uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_ica_event(text, uuid, uuid, jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.match_staff_help_knowledge(vector, int, float) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_staff_help_knowledge(vector, int, float) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.revoke_share_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_share_token(uuid) TO authenticated, service_role;