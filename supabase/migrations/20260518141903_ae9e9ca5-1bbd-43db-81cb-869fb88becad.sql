-- 1) New tracking columns on applications
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS revisions_handled_by_staff_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revisions_handled_by_staff_id UUID;

-- 2) Updated move_revisions_to_pending — preserves revision history
CREATE OR REPLACE FUNCTION public.move_revisions_to_pending(p_application_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_app record;
BEGIN
  IF NOT public.is_staff(v_actor) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT id, first_name, last_name, email, review_status, revision_count
  INTO v_app
  FROM public.applications
  WHERE id = p_application_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'application_not_found';
  END IF;

  IF v_app.review_status <> 'revisions_requested' THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  SELECT COALESCE(full_name, email) INTO v_actor_name
  FROM public.profiles WHERE id = v_actor;

  -- Preserve revision_requested_at / message / requester / pre_revision_status
  -- so the original history (e.g. "sent May 15, 2026") stays visible.
  UPDATE public.applications
  SET review_status = 'pending',
      revisions_handled_by_staff_at = now(),
      revisions_handled_by_staff_id = v_actor,
      updated_at = now()
  WHERE id = p_application_id;

  -- Still invalidate the applicant's resume link (it's dead now).
  UPDATE public.application_resume_tokens
  SET used_at = now()
  WHERE application_id = p_application_id
    AND used_at IS NULL;

  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (
    v_actor,
    v_actor_name,
    'application.revisions_moved_to_pending',
    'application',
    p_application_id,
    COALESCE(NULLIF(TRIM(CONCAT_WS(' ', v_app.first_name, v_app.last_name)), ''), v_app.email),
    jsonb_build_object('previous_revision_count', v_app.revision_count)
  );
END;
$function$;

-- 3) Attachments table
CREATE TABLE IF NOT EXISTS public.application_revision_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  note TEXT,
  uploaded_by UUID,
  uploaded_by_name TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ara_application_id
  ON public.application_revision_attachments(application_id);

ALTER TABLE public.application_revision_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view revision attachments"
  ON public.application_revision_attachments FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can insert revision attachments"
  ON public.application_revision_attachments FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND uploaded_by = auth.uid());

CREATE POLICY "Staff can delete revision attachments"
  ON public.application_revision_attachments FOR DELETE
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- 4) Private storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('application-revision-replies', 'application-revision-replies', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (staff-only)
CREATE POLICY "Staff can read revision-reply files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'application-revision-replies' AND public.is_staff(auth.uid()));

CREATE POLICY "Staff can upload revision-reply files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'application-revision-replies' AND public.is_staff(auth.uid()));

CREATE POLICY "Staff can update revision-reply files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'application-revision-replies' AND public.is_staff(auth.uid()));

CREATE POLICY "Staff can delete revision-reply files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'application-revision-replies' AND public.is_staff(auth.uid()));