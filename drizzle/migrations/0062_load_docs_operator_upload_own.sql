-- 0062: drivers could not upload load paperwork. The app writes the file to
-- load-documents/<load_id>/<type>/<name> BEFORE the load_documents row, but the
-- bucket's only INSERT policy was staff-only, so every driver BOL/POD upload
-- failed at the file step. Admit a driver's upload only into the folder of a
-- load assigned to him (first path segment = his load's id).
CREATE POLICY load_docs_operator_upload_own
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'load-documents'
  AND EXISTS (
    SELECT 1
      FROM public.loads l
      JOIN public.operators o ON o.id = l.operator_id
     WHERE l.id::text = (storage.foldername(objects.name))[1]
       AND o.user_id = auth.uid()
  )
);