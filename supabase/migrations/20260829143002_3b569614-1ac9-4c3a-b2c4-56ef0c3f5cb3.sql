REVOKE EXECUTE ON FUNCTION public.fuel_resolve_card(text, date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fuel_resolve_card(text, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fuel_resolve_card(text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fuel_resolve_card(text, date) TO service_role;