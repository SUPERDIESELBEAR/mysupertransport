
-- ══════════════════════════════════════════════════════════════════════
-- ROADSIDE INSPECTION PORTAL
-- ══════════════════════════════════════════════════════════════════════

-- 1. Enums
CREATE TYPE public.inspection_doc_scope AS ENUM ('company_wide', 'per_driver');
CREATE TYPE public.driver_upload_category AS ENUM ('roadside_inspection_report', 'repairs_maintenance_receipt');
CREATE TYPE public.driver_upload_status AS ENUM ('pending_review', 'reviewed', 'needs_attention');

-- 2. inspection_documents — company-wide and per-driver admin uploads
CREATE TABLE public.inspection_documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  scope               public.inspection_doc_scope NOT NULL DEFAULT 'company_wide',
  driver_id           UUID NULL,
  file_url            TEXT NULL,
  file_path           TEXT NULL,
  public_share_token  UUID NOT NULL DEFAULT gen_random_uuid(),
  expires_at          DATE NULL,
  uploaded_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  uploaded_by         UUID NULL
);

ALTER TABLE public.inspection_documents ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX inspection_documents_share_token_idx ON public.inspection_documents (public_share_token);
CREATE INDEX inspection_documents_driver_id_idx ON public.inspection_documents (driver_id);

-- Operators: view company-wide OR their own per-driver docs
CREATE POLICY "Operators can view their inspection docs"
  ON public.inspection_documents FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      scope = 'company_wide'
      OR (scope = 'per_driver' AND driver_id = auth.uid())
    )
  );

-- Staff can manage all inspection docs
CREATE POLICY "Staff can manage inspection documents"
  ON public.inspection_documents FOR ALL
  USING (is_staff(auth.uid()))
  WITH CHECK (is_staff(auth.uid()));

-- 3. driver_uploads — operator-submitted roadside reports & receipts
CREATE TABLE public.driver_uploads (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id    UUID NOT NULL,
  category     public.driver_upload_category NOT NULL,
  file_url     TEXT NULL,
  file_path    TEXT NULL,
  file_name    TEXT NULL,
  status       public.driver_upload_status NOT NULL DEFAULT 'pending_review',
  uploaded_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reviewed_at  TIMESTAMP WITH TIME ZONE NULL,
  reviewed_by  UUID NULL
);

ALTER TABLE public.driver_uploads ENABLE ROW LEVEL SECURITY;

CREATE INDEX driver_uploads_driver_id_idx ON public.driver_uploads (driver_id);

CREATE POLICY "Drivers can insert own uploads"
  ON public.driver_uploads FOR INSERT
  WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "Drivers can view own uploads"
  ON public.driver_uploads FOR SELECT
  USING (auth.uid() = driver_id);

CREATE POLICY "Staff can manage driver uploads"
  ON public.driver_uploads FOR ALL
  USING (is_staff(auth.uid()))
  WITH CHECK (is_staff(auth.uid()));

-- 4. Timestamp trigger for inspection_documents
CREATE TRIGGER update_inspection_documents_updated_at
  BEFORE UPDATE ON public.inspection_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. DB trigger — notify driver when upload status changes
CREATE OR REPLACE FUNCTION public.notify_driver_on_upload_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pref BOOLEAN;
  v_title TEXT;
  v_body  TEXT;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

  SELECT COALESCE(
    (SELECT in_app_enabled FROM public.notification_preferences
     WHERE user_id = NEW.driver_id AND event_type = 'document_update' LIMIT 1),
    TRUE
  ) INTO v_pref;

  IF NOT v_pref THEN RETURN NEW; END IF;

  IF NEW.status = 'reviewed' THEN
    v_title := 'Upload reviewed ✓';
    v_body  := 'Your uploaded document has been reviewed by your coordinator.';
  ELSIF NEW.status = 'needs_attention' THEN
    v_title := 'Upload needs attention';
    v_body  := 'Your coordinator flagged one of your uploaded documents — please check your binder.';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, title, body, type, channel, link)
  VALUES (NEW.driver_id, v_title, v_body, 'document_update', 'in_app', '/operator?tab=inspection-binder');

  RETURN NEW;
END;
$$;

CREATE TRIGGER notify_on_upload_status_change
  AFTER UPDATE ON public.driver_uploads
  FOR EACH ROW EXECUTE FUNCTION public.notify_driver_on_upload_status_change();

-- 6. Public RPC — fetch a single inspection_document by share token (no auth required)
CREATE OR REPLACE FUNCTION public.get_inspection_doc_by_token(p_token UUID)
RETURNS TABLE (
  id         UUID,
  name       TEXT,
  file_url   TEXT,
  expires_at DATE
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, name, file_url, expires_at
  FROM public.inspection_documents
  WHERE public_share_token = p_token
  LIMIT 1;
$$;

-- 7. Storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('inspection-documents', 'inspection-documents', false),
  ('driver-uploads', 'driver-uploads', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS – inspection-documents bucket
CREATE POLICY "Staff can upload inspection docs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'inspection-documents' AND is_staff(auth.uid()));

CREATE POLICY "Staff can update inspection docs"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'inspection-documents' AND is_staff(auth.uid()));

CREATE POLICY "Staff can delete inspection docs"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'inspection-documents' AND is_staff(auth.uid()));

CREATE POLICY "Authenticated users can view inspection docs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'inspection-documents' AND auth.uid() IS NOT NULL);

-- Storage RLS – driver-uploads bucket
CREATE POLICY "Drivers can upload to driver-uploads"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'driver-uploads'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Drivers and staff can view driver-uploads"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'driver-uploads'
    AND (
      is_staff(auth.uid())
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );

CREATE POLICY "Staff can delete driver-uploads"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'driver-uploads' AND is_staff(auth.uid()));
