REVOKE INSERT, UPDATE, DELETE ON public.equipment_return_confirmations FROM authenticated;
GRANT SELECT ON public.equipment_return_confirmations TO authenticated;
GRANT ALL ON public.equipment_return_confirmations TO service_role;