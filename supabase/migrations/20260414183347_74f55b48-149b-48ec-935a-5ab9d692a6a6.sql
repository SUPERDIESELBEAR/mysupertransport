CREATE POLICY "Staff can update application documents"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'application-documents' AND public.is_staff(auth.uid()))
  WITH CHECK (bucket_id = 'application-documents' AND public.is_staff(auth.uid()));