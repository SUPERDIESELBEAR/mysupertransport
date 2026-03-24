
-- Allow operators to upload/view their pay-setup documents using their operator_id path
CREATE POLICY "Operators can upload pay setup docs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'operator-documents'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = 'pay-setup'
    AND EXISTS (
      SELECT 1 FROM public.operators
      WHERE id::text = (storage.foldername(name))[2]
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "Operators can view their pay setup docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'operator-documents'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = 'pay-setup'
    AND EXISTS (
      SELECT 1 FROM public.operators
      WHERE id::text = (storage.foldername(name))[2]
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "Operators can update their pay setup docs"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'operator-documents'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = 'pay-setup'
    AND EXISTS (
      SELECT 1 FROM public.operators
      WHERE id::text = (storage.foldername(name))[2]
        AND user_id = auth.uid()
    )
  );
