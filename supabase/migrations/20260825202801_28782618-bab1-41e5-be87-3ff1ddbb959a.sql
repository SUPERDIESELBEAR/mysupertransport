CREATE POLICY "Staff can view broker documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'broker-documents' AND public.is_staff(auth.uid()));

CREATE POLICY "Staff can upload broker documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'broker-documents' AND public.is_staff(auth.uid()));

CREATE POLICY "Staff can update broker documents"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'broker-documents' AND public.is_staff(auth.uid()))
  WITH CHECK (bucket_id = 'broker-documents' AND public.is_staff(auth.uid()));

CREATE POLICY "Staff can delete broker documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'broker-documents' AND public.is_staff(auth.uid()));

-- broker_documents rows: staff read/write, operators none.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broker_documents TO authenticated;
GRANT ALL ON public.broker_documents TO service_role;