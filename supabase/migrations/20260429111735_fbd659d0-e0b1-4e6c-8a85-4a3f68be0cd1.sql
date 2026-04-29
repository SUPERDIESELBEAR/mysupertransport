CREATE POLICY "Authenticated can view company-docs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'operator-documents'
  AND (storage.foldername(name))[1] = 'company-docs'
);