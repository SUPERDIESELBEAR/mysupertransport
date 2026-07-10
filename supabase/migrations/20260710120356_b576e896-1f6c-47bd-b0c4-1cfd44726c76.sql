
-- 1. Recreate v_compliance_items with security_invoker so it uses caller's RLS
ALTER VIEW public.v_compliance_items SET (security_invoker = on);

-- 2. applications: strict WITH CHECK on public insert
DROP POLICY IF EXISTS "Public can submit application with email" ON public.applications;
CREATE POLICY "Public can submit application with email"
  ON public.applications
  FOR INSERT
  WITH CHECK (
    email IS NOT NULL AND email <> ''
    AND user_id IS NULL
    AND review_status = 'pending'::review_status
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND reviewer_notes IS NULL
    AND background_verification_notes IS NULL
    AND mvr_status = 'not_started'::mvr_status
    AND ch_status = 'not_started'::mvr_status
    AND pei_status = 'not_started'::pei_applicant_status
    AND COALESCE(submitted_by_staff, false) = false
  );

-- 3. applications: strict WITH CHECK on owner draft update
DROP POLICY IF EXISTS "Owner can update draft application" ON public.applications;
CREATE POLICY "Owner can update draft application"
  ON public.applications
  FOR UPDATE
  USING (auth.uid() = user_id AND is_draft = true)
  WITH CHECK (
    auth.uid() = user_id
    AND is_draft = true
    AND review_status = 'pending'::review_status
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND reviewer_notes IS NULL
    AND background_verification_notes IS NULL
    AND mvr_status = 'not_started'::mvr_status
    AND ch_status = 'not_started'::mvr_status
    AND pei_status = 'not_started'::pei_applicant_status
    AND COALESCE(submitted_by_staff, false) = false
  );

-- 4. Storage: tighten anon upload policies with mime allowlist + size cap
DROP POLICY IF EXISTS "Anyone can upload application docs under applications/" ON storage.objects;
CREATE POLICY "Anyone can upload application docs under applications/"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'application-documents'
    AND (storage.foldername(name))[1] = 'applications'
    AND COALESCE((metadata->>'size')::bigint, 0) BETWEEN 1 AND 20971520
    AND lower(COALESCE(metadata->>'mimetype', '')) IN (
      'image/jpeg','image/jpg','image/png','image/webp','image/heic','image/heif','application/pdf'
    )
  );

DROP POLICY IF EXISTS "Anyone can upload signatures under signatures/" ON storage.objects;
CREATE POLICY "Anyone can upload signatures under signatures/"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'signatures'
    AND (storage.foldername(name))[1] = 'signatures'
    AND COALESCE((metadata->>'size')::bigint, 0) BETWEEN 1 AND 2097152
    AND lower(COALESCE(metadata->>'mimetype', '')) IN ('image/png','image/jpeg','image/webp')
  );
