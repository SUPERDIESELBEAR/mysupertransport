ALTER FUNCTION public.operator_has_truck_owner(uuid) SET search_path = public, extensions;
REVOKE EXECUTE ON FUNCTION public.operator_has_truck_owner(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.operator_has_truck_owner(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.operator_has_truck_owner(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.operator_has_truck_owner(uuid) TO service_role;