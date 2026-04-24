-- Remove the broken user_id-based SELECT policy
DROP POLICY IF EXISTS "Operators can view their operator docs folder" ON storage.objects;

-- Remove the overly permissive INSERT policy
DROP POLICY IF EXISTS "Operators can upload operator docs" ON storage.objects;

-- Operators can read any object under their own operator_id folder
CREATE POLICY "Operators can view their operator docs folder"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'operator-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.operators WHERE user_id = auth.uid()
  )
);

-- Operators can insert objects only under their own operator_id folder
CREATE POLICY "Operators can upload operator docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'operator-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.operators WHERE user_id = auth.uid()
  )
);

-- Operators can replace (UPDATE) their own files — needed for "Replace Photo"
CREATE POLICY "Operators can update their operator docs"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'operator-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.operators WHERE user_id = auth.uid()
  )
);

-- Operators can delete their own files
CREATE POLICY "Operators can delete their operator docs"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'operator-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.operators WHERE user_id = auth.uid()
  )
);