-- 0053: the permissive INSERT policy on public.applications named anon as well as
-- authenticated, but 0048 revoked anon's INSERT grant (the public form goes through
-- save_application_draft / submit_application_draft, both SECURITY DEFINER, and never
-- used the grant). A policy naming a role that holds no grant is dead text and the
-- live grant/policy parity guard reports it. Re-declare it for authenticated only --
-- the same predicate, no widening, and nothing anonymous loses anything it could use.

DROP POLICY IF EXISTS "Public can submit application with email" ON public.applications;

CREATE POLICY "Signed-in applicant can submit application with email"
  ON public.applications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    email IS NOT NULL
    AND email <> ''
    AND user_id IS NULL
    AND review_status = 'pending'::review_status
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND reviewer_notes IS NULL
    AND background_verification_notes IS NULL
    AND mvr_status = 'not_started'::mvr_status
    AND ch_status = 'not_started'::mvr_status
    AND pei_status = 'not_started'::pei_applicant_status
    AND COALESCE(submitted_by_staff, false) = false
  );