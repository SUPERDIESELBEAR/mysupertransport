-- PSP screening status + interview notes log for applications.
-- `applications` is GLOBAL per the tenancy record, so its child notes table is
-- GLOBAL as well (no company_id).

-- 1. PSP status on the application, reusing the existing mvr_status enum.
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS psp_status public.mvr_status NOT NULL DEFAULT 'not_started';

-- 2. PSP mirrors MVR/CH on the onboarding record, including request/receive dates.
ALTER TABLE public.onboarding_status
  ADD COLUMN IF NOT EXISTS psp_status public.mvr_status NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS psp_requested_date date,
  ADD COLUMN IF NOT EXISTS psp_received_date date;

-- 3. PSP request/receive dates on the application, alongside the status.
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS psp_requested_date date,
  ADD COLUMN IF NOT EXISTS psp_received_date date,
  ADD COLUMN IF NOT EXISTS mvr_requested_date date,
  ADD COLUMN IF NOT EXISTS mvr_received_date date,
  ADD COLUMN IF NOT EXISTS ch_requested_date date,
  ADD COLUMN IF NOT EXISTS ch_received_date date;

-- 4. Interview notes: one row per interviewer entry, author stamped.
CREATE TABLE IF NOT EXISTS public.application_interview_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  author_name text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz
);

CREATE INDEX IF NOT EXISTS application_interview_notes_application_idx
  ON public.application_interview_notes (application_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.application_interview_notes TO authenticated;
GRANT ALL ON public.application_interview_notes TO service_role;
REVOKE ALL ON public.application_interview_notes FROM PUBLIC;
REVOKE ALL ON public.application_interview_notes FROM anon;

ALTER TABLE public.application_interview_notes ENABLE ROW LEVEL SECURITY;

-- Staff-only. Applicants and anonymous callers have no access at all.
DROP POLICY IF EXISTS "Hiring staff can read interview notes" ON public.application_interview_notes;
CREATE POLICY "Hiring staff can read interview notes"
  ON public.application_interview_notes FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'onboarding_staff')
    OR public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
  );

DROP POLICY IF EXISTS "Hiring staff can add interview notes" ON public.application_interview_notes;
CREATE POLICY "Hiring staff can add interview notes"
  ON public.application_interview_notes FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      public.has_role(auth.uid(), 'onboarding_staff')
      OR public.has_role(auth.uid(), 'management')
      OR public.has_role(auth.uid(), 'owner')
    )
  );

-- Authors edit their own; management/owner may edit any.
DROP POLICY IF EXISTS "Authors and management can edit interview notes" ON public.application_interview_notes;
CREATE POLICY "Authors and management can edit interview notes"
  ON public.application_interview_notes FOR UPDATE TO authenticated
  USING (
    author_id = auth.uid()
    OR public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
  )
  WITH CHECK (
    author_id = auth.uid()
    OR public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
  );

-- Deletion is management/owner only.
DROP POLICY IF EXISTS "Management can delete interview notes" ON public.application_interview_notes;
CREATE POLICY "Management can delete interview notes"
  ON public.application_interview_notes FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
  );

-- 5. Stamp edited_at / updated_at on any body change, server side.
CREATE OR REPLACE FUNCTION public.stamp_interview_note_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.body IS DISTINCT FROM OLD.body THEN
    NEW.edited_at := now();
  END IF;
  -- Authorship is immutable.
  NEW.author_id := OLD.author_id;
  NEW.author_name := OLD.author_name;
  NEW.application_id := OLD.application_id;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_interview_note_edit ON public.application_interview_notes;
CREATE TRIGGER stamp_interview_note_edit
  BEFORE UPDATE ON public.application_interview_notes
  FOR EACH ROW EXECUTE FUNCTION public.stamp_interview_note_edit();