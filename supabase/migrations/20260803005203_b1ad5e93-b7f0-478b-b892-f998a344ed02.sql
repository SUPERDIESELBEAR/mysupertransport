DROP POLICY IF EXISTS "Operators can upload pay setup docs" ON storage.objects;
CREATE POLICY "Operators can upload pay setup docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'operator-documents'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = 'pay-setup'
  AND EXISTS (
    SELECT 1 FROM public.operators
    WHERE operators.id::text = (storage.foldername(name))[2]
      AND operators.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Operators can update their pay setup docs" ON storage.objects;
CREATE POLICY "Operators can update their pay setup docs"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'operator-documents'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = 'pay-setup'
  AND EXISTS (
    SELECT 1 FROM public.operators
    WHERE operators.id::text = (storage.foldername(name))[2]
      AND operators.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Operators can view own fleet documents" ON storage.objects;
CREATE POLICY "Operators can view own fleet documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'fleet-documents'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] IN (
    SELECT operators.id::text FROM public.operators WHERE operators.user_id = auth.uid()
  )
);