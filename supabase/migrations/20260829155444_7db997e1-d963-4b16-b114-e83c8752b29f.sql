REVOKE ALL ON FUNCTION public.fuel_resolve_card(text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fuel_resolve_card(text, date) FROM anon;
REVOKE ALL ON FUNCTION public.fuel_resolve_card(text, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fuel_resolve_card(text, date) TO service_role;