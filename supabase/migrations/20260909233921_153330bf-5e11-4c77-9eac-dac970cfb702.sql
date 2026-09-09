ALTER TYPE public.driver_upload_category ADD VALUE IF NOT EXISTS 'binder_cdl_front';
ALTER TYPE public.driver_upload_category ADD VALUE IF NOT EXISTS 'binder_cdl_back';
ALTER TYPE public.driver_upload_category ADD VALUE IF NOT EXISTS 'binder_medical';
ALTER TYPE public.driver_upload_category ADD VALUE IF NOT EXISTS 'binder_irp';
ALTER TYPE public.driver_upload_category ADD VALUE IF NOT EXISTS 'binder_2290';

ALTER TABLE public.driver_uploads
  ADD COLUMN IF NOT EXISTS binder_document_id uuid REFERENCES public.inspection_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS proposed_expires_at date,
  ADD COLUMN IF NOT EXISTS review_note text;

CREATE INDEX IF NOT EXISTS driver_uploads_binder_document_id_idx
  ON public.driver_uploads (binder_document_id)
  WHERE binder_document_id IS NOT NULL;