DROP POLICY IF EXISTS "Anyone can upload signatures under signatures/" ON storage.objects;

CREATE POLICY "Anyone can upload signatures under signatures/"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'signatures'
  AND (storage.foldername(name))[1] = 'signatures'
  AND COALESCE((metadata->>'size')::bigint, 0) <= 2097152
  AND (
    COALESCE(metadata->>'mimetype', '') = ''
    OR lower(metadata->>'mimetype') LIKE 'image/%'
  )
);