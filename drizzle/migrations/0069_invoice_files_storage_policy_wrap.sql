-- 0069: the invoice-files read policy called has_permission bare, so it ran
-- once per row. Same rule, wrapped as a sub-SELECT (permission-wrapper guard).
DROP POLICY IF EXISTS invoice_files_same_company_read ON storage.objects;
CREATE POLICY invoice_files_same_company_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoice-files'
    AND (storage.foldername(name))[1] = (SELECT public.current_company_id())::text
    AND (SELECT public.has_permission('invoice.view'))
  );