
CREATE POLICY "dot_consultant_attach_staff_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'dot-consultant-attachments' AND (
    public.has_role(auth.uid(), 'onboarding_staff') OR
    public.has_role(auth.uid(), 'dispatcher') OR
    public.has_role(auth.uid(), 'management') OR
    public.has_role(auth.uid(), 'owner')
  )
);

CREATE POLICY "dot_consultant_attach_staff_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'dot-consultant-attachments' AND (
    public.has_role(auth.uid(), 'onboarding_staff') OR
    public.has_role(auth.uid(), 'dispatcher') OR
    public.has_role(auth.uid(), 'management') OR
    public.has_role(auth.uid(), 'owner')
  )
);

CREATE POLICY "dot_consultant_attach_staff_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'dot-consultant-attachments' AND (
    public.has_role(auth.uid(), 'onboarding_staff') OR
    public.has_role(auth.uid(), 'dispatcher') OR
    public.has_role(auth.uid(), 'management') OR
    public.has_role(auth.uid(), 'owner')
  )
);
