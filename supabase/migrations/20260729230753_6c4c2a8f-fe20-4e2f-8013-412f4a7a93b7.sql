
CREATE POLICY "eld_notices_driver_insert_own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'eld-notices'
  AND EXISTS (
    SELECT 1 FROM public.operators o
    WHERE o.user_id = auth.uid() AND o.id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "eld_notices_driver_select_own"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'eld-notices'
  AND (
    public.is_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.operators o
      WHERE o.user_id = auth.uid() AND o.id::text = (storage.foldername(name))[1]
    )
  )
);

CREATE POLICY "eld_notices_management_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'eld-notices'
  AND (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
);
