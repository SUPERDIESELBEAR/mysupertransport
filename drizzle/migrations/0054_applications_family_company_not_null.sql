-- Pass 3e: company_id NOT NULL on the eleven applications/PEI family tables.
-- Pre-check (2026-09-23): 0 NULL rows in all eleven.
-- UNDO: ALTER TABLE public.<table> ALTER COLUMN company_id DROP NOT NULL; (for each table below)
ALTER TABLE public.applications ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.application_invites ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.application_correction_requests ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.application_correction_fields ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.application_document_history ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.application_interview_notes ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.application_revision_attachments ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.pei_requests ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.pei_responses ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.pei_accidents ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.pei_request_events ALTER COLUMN company_id SET NOT NULL;