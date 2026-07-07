REVOKE EXECUTE ON FUNCTION public.execute_equipment_asset_signature(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_equipment_asset_signature(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_equipment_asset_signature(uuid, text, text) TO service_role;