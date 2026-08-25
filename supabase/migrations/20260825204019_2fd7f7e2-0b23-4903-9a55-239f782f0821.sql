-- The author-scoped note policies called public.current_profile_id(), which
-- authenticated is not allowed to execute, so both silently failed for the
-- author. Resolve the profile inline instead; behaviour is otherwise identical.
DROP POLICY IF EXISTS broker_notes_author_update ON public.broker_notes;
DROP POLICY IF EXISTS broker_notes_author_delete ON public.broker_notes;

CREATE POLICY broker_notes_author_update ON public.broker_notes
  FOR UPDATE TO authenticated
  USING (
    (public.has_role(auth.uid(), 'dispatcher') OR public.has_role(auth.uid(), 'onboarding_staff'))
    AND created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
  )
  WITH CHECK (
    (public.has_role(auth.uid(), 'dispatcher') OR public.has_role(auth.uid(), 'onboarding_staff'))
    AND created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY broker_notes_author_delete ON public.broker_notes
  FOR DELETE TO authenticated
  USING (
    (public.has_role(auth.uid(), 'dispatcher') OR public.has_role(auth.uid(), 'onboarding_staff'))
    AND created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
  );