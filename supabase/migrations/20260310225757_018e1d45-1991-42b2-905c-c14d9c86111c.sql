
-- ─────────────────────────────────────────────────────────────────────────────
-- Fix storage RLS for application-documents and signatures buckets
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Remove duplicate INSERT policies (keep the "Public can upload..." ones)
DROP POLICY IF EXISTS "Anyone can upload application documents" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload signature" ON storage.objects;

-- 2. Remove the narrower/confusing SELECT policies that will be replaced
DROP POLICY IF EXISTS "Auth users can view application documents" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can view signatures" ON storage.objects;

-- 3. Recreate staff SELECT policies (idempotent)
DROP POLICY IF EXISTS "Staff can view application documents" ON storage.objects;
CREATE POLICY "Staff can view application documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'application-documents' AND is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can view signatures" ON storage.objects;
CREATE POLICY "Staff can view signatures"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'signatures' AND is_staff(auth.uid()));

-- 4. Add broader authenticated SELECT so any logged-in user
--    (management, dispatcher reviewing ICA/docs, etc.) can load images inline.
--    Uploads are already open to anon, so reads being auth-gated is fine.
DROP POLICY IF EXISTS "Authenticated users can view application documents" ON storage.objects;
CREATE POLICY "Authenticated users can view application documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'application-documents' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can view signatures" ON storage.objects;
CREATE POLICY "Authenticated users can view signatures"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'signatures' AND auth.uid() IS NOT NULL);

-- 5. Add staff DELETE on signatures
DROP POLICY IF EXISTS "Staff can delete signatures" ON storage.objects;
CREATE POLICY "Staff can delete signatures"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'signatures' AND is_staff(auth.uid()));
