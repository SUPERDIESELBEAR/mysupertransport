DROP POLICY IF EXISTS "Anyone can upload application docs under applications/" ON storage.objects;

CREATE POLICY "Anyone can upload application docs under applications/"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'application-documents'
  AND (storage.foldername(name))[1] = 'applications'
  AND COALESCE((metadata->>'size')::bigint, 0) <= 20971520
  AND (
    lower(COALESCE(metadata->>'mimetype', '')) = ''
    OR lower(COALESCE(metadata->>'mimetype', '')) LIKE 'image/%'
    OR lower(COALESCE(metadata->>'mimetype', '')) = 'application/pdf'
  )
);