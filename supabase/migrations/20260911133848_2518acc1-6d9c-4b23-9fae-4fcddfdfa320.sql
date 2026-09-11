REVOKE EXECUTE ON FUNCTION public.initiate_owner_transfer(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_owner_transfer(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.transfer_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.initiate_owner_transfer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_owner_transfer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_owner(uuid) TO authenticated;