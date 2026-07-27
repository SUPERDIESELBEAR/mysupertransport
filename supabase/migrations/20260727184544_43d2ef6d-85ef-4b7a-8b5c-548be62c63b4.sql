
DROP POLICY IF EXISTS "Public can view resource library" ON storage.objects;
CREATE POLICY "Signed-in users can view resource library"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'resource-library');
