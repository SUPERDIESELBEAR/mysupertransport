
ALTER FUNCTION public.compliance_status(int, int) SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.sync_application_expiry_to_binder() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_inspection_expiry_change() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.compliance_status(int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compliance_status(int, int) TO authenticated;
