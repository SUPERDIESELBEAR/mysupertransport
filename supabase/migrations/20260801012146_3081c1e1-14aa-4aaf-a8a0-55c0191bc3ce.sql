-- 1. Safe counter RPC so staff UI never needs table-level access to raw tokens
CREATE OR REPLACE FUNCTION public.count_unused_resume_tokens(_application_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('owner','management','onboarding_staff','dispatcher')
      LIMIT 1
    )
    THEN (
      SELECT count(*)::int
      FROM public.application_resume_tokens t
      WHERE t.application_id = _application_id
        AND t.used_at IS NULL
    )
    ELSE 0
  END
$$;

REVOKE ALL ON FUNCTION public.count_unused_resume_tokens(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_unused_resume_tokens(uuid) TO authenticated;

-- 2. Policyless RLS tables must not hold client-role grants
REVOKE ALL ON public.application_resume_tokens FROM anon, authenticated;
REVOKE ALL ON public.document_short_links FROM anon, authenticated;
REVOKE ALL ON public.message_notification_throttle FROM anon, authenticated;

GRANT ALL ON public.application_resume_tokens TO service_role;
GRANT ALL ON public.document_short_links TO service_role;
GRANT ALL ON public.message_notification_throttle TO service_role;