REVOKE EXECUTE ON FUNCTION public.recompute_eld_extension_projection(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_eld_extension_projection(uuid) TO service_role;

CREATE POLICY eld_notices_management_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'eld-notices'
    AND (
      public.has_role(auth.uid(), 'management'::app_role)
      OR public.has_role(auth.uid(), 'owner'::app_role)
    )
  );

CREATE POLICY eld_notices_management_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'eld-notices'
    AND (
      public.has_role(auth.uid(), 'management'::app_role)
      OR public.has_role(auth.uid(), 'owner'::app_role)
    )
  )
  WITH CHECK (
    bucket_id = 'eld-notices'
    AND (
      public.has_role(auth.uid(), 'management'::app_role)
      OR public.has_role(auth.uid(), 'owner'::app_role)
    )
  );