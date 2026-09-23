-- Pass 3e: company_id is filled by the stamp triggers (stamp_application_company on the
-- two roots, stamp_child_company_from_parent on the nine children), never by the caller.
-- An explicit DEFAULT NULL keeps the column optional on insert for app code while
-- NOT NULL (0054) still refuses any row the trigger did not stamp.
-- UNDO: ALTER TABLE public.<table> ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE public.applications ALTER COLUMN company_id SET DEFAULT NULL;
ALTER TABLE public.application_invites ALTER COLUMN company_id SET DEFAULT NULL;
ALTER TABLE public.application_correction_requests ALTER COLUMN company_id SET DEFAULT NULL;
ALTER TABLE public.application_correction_fields ALTER COLUMN company_id SET DEFAULT NULL;
ALTER TABLE public.application_document_history ALTER COLUMN company_id SET DEFAULT NULL;
ALTER TABLE public.application_interview_notes ALTER COLUMN company_id SET DEFAULT NULL;
ALTER TABLE public.application_revision_attachments ALTER COLUMN company_id SET DEFAULT NULL;
ALTER TABLE public.pei_requests ALTER COLUMN company_id SET DEFAULT NULL;
ALTER TABLE public.pei_responses ALTER COLUMN company_id SET DEFAULT NULL;
ALTER TABLE public.pei_accidents ALTER COLUMN company_id SET DEFAULT NULL;
ALTER TABLE public.pei_request_events ALTER COLUMN company_id SET DEFAULT NULL;