CREATE POLICY "rods logs driver read own folder" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'rods-logs'
    AND (storage.foldername(name))[1] IN (
      SELECT o.id::text FROM public.operators o WHERE o.user_id = auth.uid()
    )
  );

CREATE POLICY "rods logs driver upload own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'rods-logs'
    AND (storage.foldername(name))[1] IN (
      SELECT o.id::text FROM public.operators o WHERE o.user_id = auth.uid()
    )
  );

CREATE POLICY "rods logs staff read all" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'rods-logs' AND public.is_staff(auth.uid()));