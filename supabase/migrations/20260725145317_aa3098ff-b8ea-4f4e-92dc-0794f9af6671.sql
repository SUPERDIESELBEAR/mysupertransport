CREATE POLICY "Operators can upload OSAS signatures"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'signatures'
  AND (storage.foldername(name))[1] = 'osas'
  AND (storage.foldername(name))[2] IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.operators o
    WHERE o.user_id = auth.uid()
      AND o.id::text = (storage.foldername(name))[2]
  )
  AND COALESCE((metadata ->> 'size')::bigint, 0) <= 2097152
  AND (
    COALESCE(metadata ->> 'mimetype', '') = ''
    OR lower(metadata ->> 'mimetype') LIKE 'image/%'
  )
);

CREATE POLICY "Operators can view OSAS signatures"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'signatures'
  AND (storage.foldername(name))[1] = 'osas'
  AND (storage.foldername(name))[2] IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.operators o
    WHERE o.user_id = auth.uid()
      AND o.id::text = (storage.foldername(name))[2]
  )
);

CREATE POLICY "Operators can update OSAS signatures"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'signatures'
  AND (storage.foldername(name))[1] = 'osas'
  AND (storage.foldername(name))[2] IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.operators o
    WHERE o.user_id = auth.uid()
      AND o.id::text = (storage.foldername(name))[2]
  )
)
WITH CHECK (
  bucket_id = 'signatures'
  AND (storage.foldername(name))[1] = 'osas'
  AND (storage.foldername(name))[2] IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.operators o
    WHERE o.user_id = auth.uid()
      AND o.id::text = (storage.foldername(name))[2]
  )
  AND COALESCE((metadata ->> 'size')::bigint, 0) <= 2097152
  AND (
    COALESCE(metadata ->> 'mimetype', '') = ''
    OR lower(metadata ->> 'mimetype') LIKE 'image/%'
  )
);