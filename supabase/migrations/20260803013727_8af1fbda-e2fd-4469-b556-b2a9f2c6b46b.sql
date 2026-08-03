REVOKE EXECUTE ON FUNCTION public.enforce_application_document_history_append_only() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_application_document_history_append_only() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_application_document_history_append_only() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_application_document_history_append_only() TO service_role;