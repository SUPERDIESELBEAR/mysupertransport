CREATE OR REPLACE FUNCTION public.count_unused_resume_tokens(_application_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Positive refuse: permit inside the IF, raise after it. No ELSE 0 --
  -- an unauthorized caller must not be handed a plausible count.
  IF coalesce((
        SELECT true
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role IN ('owner','management','onboarding_staff','dispatcher')
        LIMIT 1
      ), false) THEN
    RETURN (
      SELECT count(*)::int
      FROM public.application_resume_tokens t
      WHERE t.application_id = _application_id
        AND t.used_at IS NULL
    );
  END IF;

  RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.count_unused_resume_tokens(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_unused_resume_tokens(uuid) TO authenticated;