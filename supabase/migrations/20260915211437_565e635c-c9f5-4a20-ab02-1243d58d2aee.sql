ALTER FUNCTION public.stamp_company_from_load() SET search_path = public, extensions;
ALTER FUNCTION public.stamp_company_from_operator() SET search_path = public, extensions;
REVOKE ALL ON FUNCTION public.stamp_company_from_load() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stamp_company_from_operator() FROM PUBLIC, anon, authenticated;