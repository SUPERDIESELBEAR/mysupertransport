-- 20260831192947 deliberately revoked this from authenticated: it is an
-- internal helper called by the definer functions that own load money, never
-- from the client. The re-create in the previous migration granted it back;
-- restore the original posture.
REVOKE ALL ON FUNCTION public.recompute_load_total_value(uuid, text) FROM PUBLIC, anon, authenticated;