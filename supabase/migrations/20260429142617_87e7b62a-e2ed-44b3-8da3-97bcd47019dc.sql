
REVOKE EXECUTE ON FUNCTION public.mark_operator_seen(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_operator_seen(boolean) TO authenticated;
