-- Partial unique index enforcing one submitted application per email address.
-- Draft rows (is_draft = true) are excluded, so applicants can save and resume
-- drafts freely. Only finalized (is_draft = false) submissions are constrained.
CREATE UNIQUE INDEX applications_email_non_draft_unique
  ON public.applications (lower(email))
  WHERE is_draft IS NOT TRUE;

COMMENT ON INDEX applications_email_non_draft_unique IS
  'Prevents duplicate submitted applications for the same email address. Drafts (is_draft = true) are exempt.';