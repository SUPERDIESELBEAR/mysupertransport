-- The three demo-guardrail triggers shipped without the house conventions:
-- a pinned search_path that includes extensions, and EXECUTE revoked from
-- client roles. They are trigger functions; nothing should be able to call
-- them directly.
ALTER FUNCTION public.enforce_record_is_demo() SET search_path = public, extensions;
ALTER FUNCTION public.enforce_no_demo_share_tokens() SET search_path = public, extensions;
ALTER FUNCTION public.enforce_demo_clear_requires_purge() SET search_path = public, extensions;

REVOKE ALL ON FUNCTION public.enforce_record_is_demo() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_no_demo_share_tokens() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_demo_clear_requires_purge() FROM PUBLIC, anon, authenticated;