ALTER FUNCTION public.invoice_readiness_missing(uuid) SECURITY INVOKER;
REVOKE ALL ON FUNCTION public.invoice_readiness_missing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invoice_readiness_missing(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.assert_invoice_ready(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_invoice_ready(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.guard_invoice_create_paperwork() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_invoice_create_paperwork() TO service_role;