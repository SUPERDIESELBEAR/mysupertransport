REVOKE EXECUTE ON FUNCTION public.auto_handle_ingested_rate_con() FROM PUBLIC, anon, authenticated;

CREATE POLICY "Dispatch staff read ingested rate con files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'rate-con-ingest'
    AND (
      public.has_role(auth.uid(), 'dispatcher')
      OR public.has_role(auth.uid(), 'management')
      OR public.has_role(auth.uid(), 'owner')
    )
  );