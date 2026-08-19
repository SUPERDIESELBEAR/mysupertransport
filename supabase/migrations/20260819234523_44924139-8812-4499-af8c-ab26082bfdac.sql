-- Server-side attribution for load document uploads
CREATE OR REPLACE FUNCTION public.set_load_document_uploader()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.uploaded_by := public.current_profile_id();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_load_documents_uploader ON public.load_documents;
CREATE TRIGGER trg_load_documents_uploader
BEFORE INSERT ON public.load_documents
FOR EACH ROW EXECUTE FUNCTION public.set_load_document_uploader();

-- Server-side attribution for exception resolution
CREATE OR REPLACE FUNCTION public.stamp_document_exception_resolution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'pending' THEN
    NEW.resolved_by := public.current_profile_id();
    NEW.resolved_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_document_exceptions_resolution ON public.document_exceptions;
CREATE TRIGGER trg_document_exceptions_resolution
BEFORE UPDATE ON public.document_exceptions
FOR EACH ROW EXECUTE FUNCTION public.stamp_document_exception_resolution();

-- Storage policies for the private load-documents bucket
DROP POLICY IF EXISTS "load_docs_staff_read" ON storage.objects;
DROP POLICY IF EXISTS "load_docs_staff_insert" ON storage.objects;
DROP POLICY IF EXISTS "load_docs_staff_update" ON storage.objects;
DROP POLICY IF EXISTS "load_docs_staff_delete" ON storage.objects;
DROP POLICY IF EXISTS "load_docs_operator_read_own" ON storage.objects;

CREATE POLICY "load_docs_staff_read" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'load-documents' AND (
    public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner')
    OR public.has_role(auth.uid(),'dispatcher') OR public.has_role(auth.uid(),'onboarding_staff')
  )
);

CREATE POLICY "load_docs_staff_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'load-documents' AND (
    public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner')
    OR public.has_role(auth.uid(),'dispatcher') OR public.has_role(auth.uid(),'onboarding_staff')
  )
);

CREATE POLICY "load_docs_staff_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'load-documents' AND (
    public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner')
    OR public.has_role(auth.uid(),'dispatcher') OR public.has_role(auth.uid(),'onboarding_staff')
  )
)
WITH CHECK (
  bucket_id = 'load-documents' AND (
    public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner')
    OR public.has_role(auth.uid(),'dispatcher') OR public.has_role(auth.uid(),'onboarding_staff')
  )
);

CREATE POLICY "load_docs_staff_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'load-documents' AND (
    public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner')
    OR public.has_role(auth.uid(),'dispatcher') OR public.has_role(auth.uid(),'onboarding_staff')
  )
);

-- Operators: read-only, only files belonging to loads assigned to them
CREATE POLICY "load_docs_operator_read_own" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'load-documents'
  AND EXISTS (
    SELECT 1
    FROM public.load_documents ld
    JOIN public.loads l ON l.id = ld.load_id
    JOIN public.operators o ON o.id = l.operator_id
    WHERE ld.file_path = storage.objects.name
      AND o.user_id = auth.uid()
  )
);