CREATE POLICY "Truck owners can upload contractor signature"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'ica-signatures'
    AND (storage.foldername(name))[1] = 'contractor'
    AND EXISTS (
      SELECT 1 FROM public.truck_owners t
      WHERE t.user_id = auth.uid()
        AND objects.name LIKE ('contractor/' || t.operator_id::text || '-%')
    )
  );

CREATE POLICY "Truck owners can view contractor signature"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'ica-signatures'
    AND (
      (storage.foldername(name))[1] = 'carrier-default'
      OR (
        (storage.foldername(name))[1] = 'contractor'
        AND EXISTS (
          SELECT 1 FROM public.truck_owners t
          WHERE t.user_id = auth.uid()
            AND objects.name LIKE ('contractor/' || t.operator_id::text || '-%')
        )
      )
    )
  );