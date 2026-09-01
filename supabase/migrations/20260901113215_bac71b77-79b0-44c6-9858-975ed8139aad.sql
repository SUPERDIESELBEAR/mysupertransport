REVOKE ALL ON FUNCTION public.settlement_writer_active() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settlement_writer_active() FROM anon;
REVOKE ALL ON FUNCTION public.settlement_writer_active() FROM authenticated;

REVOKE ALL ON FUNCTION public.enforce_settlement_immutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_settlement_immutability() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_settlement_immutability() FROM authenticated;

REVOKE ALL ON FUNCTION public.enforce_settlement_child_immutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_settlement_child_immutability() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_settlement_child_immutability() FROM authenticated;