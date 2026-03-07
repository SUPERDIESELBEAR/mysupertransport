
-- Allow anonymous uploads to application-documents bucket for public form
CREATE POLICY "Public can upload application documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'application-documents');

-- Allow viewing application documents (for staff and owners)
CREATE POLICY "Staff can view application documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'application-documents' 
  AND is_staff(auth.uid())
);

-- Allow anonymous/public signature uploads
CREATE POLICY "Public can upload signatures"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'signatures');

-- Staff can view signatures
CREATE POLICY "Staff can view signatures"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'signatures'
  AND is_staff(auth.uid())
);
