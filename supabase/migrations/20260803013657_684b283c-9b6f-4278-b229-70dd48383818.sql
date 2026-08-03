CREATE TABLE public.application_document_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  document_key text NOT NULL CHECK (document_key IN ('dl_front_url','dl_rear_url','medical_cert_url')),
  old_path text,
  new_path text,
  source text NOT NULL CHECK (source IN ('staff_replacement','applicant_retake','retake_requested')),
  reason text,
  note text,
  changed_by uuid,
  changed_by_name text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_app_doc_history_application ON public.application_document_history (application_id, changed_at DESC);

GRANT SELECT, INSERT ON public.application_document_history TO authenticated;
GRANT ALL ON public.application_document_history TO service_role;

ALTER TABLE public.application_document_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view application document history"
  ON public.application_document_history FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can insert application document history"
  ON public.application_document_history FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.enforce_application_document_history_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RAISE EXCEPTION 'application_document_history is append-only';
END;
$$;

CREATE TRIGGER application_document_history_append_only
  BEFORE UPDATE OR DELETE ON public.application_document_history
  FOR EACH ROW EXECUTE FUNCTION public.enforce_application_document_history_append_only();

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS document_retake_requests jsonb NOT NULL DEFAULT '{}'::jsonb;