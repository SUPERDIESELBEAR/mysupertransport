
DROP POLICY IF EXISTS "Operators can upload their own contractor signature" ON storage.objects;
DROP POLICY IF EXISTS "Operators can view their own ICA signatures" ON storage.objects;

CREATE POLICY "Operators can upload their own contractor signature"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'ica-signatures'
  AND (storage.foldername(name))[1] = 'contractor'
  AND EXISTS (
    SELECT 1 FROM public.operators o
    WHERE o.user_id = auth.uid()
      AND objects.name LIKE ('contractor/' || o.id::text || '-%')
  )
);

CREATE POLICY "Operators can view their own ICA signatures"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'ica-signatures'
  AND (
    (storage.foldername(name))[1] = 'carrier-default'
    OR (
      (storage.foldername(name))[1] = 'contractor'
      AND EXISTS (
        SELECT 1 FROM public.operators o
        WHERE o.user_id = auth.uid()
          AND objects.name LIKE ('contractor/' || o.id::text || '-%')
      )
    )
  )
);
