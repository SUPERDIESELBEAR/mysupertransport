DROP POLICY IF EXISTS "Operators can view their pay setup docs" ON storage.objects;
CREATE POLICY "Operators can view their pay setup docs"
ON storage.objects FOR SELECT TO authenticated
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