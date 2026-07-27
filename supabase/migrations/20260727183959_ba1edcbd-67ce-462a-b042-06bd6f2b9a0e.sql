
-- 1) Server-side validation for public (unauthenticated) application submissions
CREATE OR REPLACE FUNCTION public.validate_public_application_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Only enforce on anonymous/public submissions (no owner, not staff)
  IF NEW.user_id IS NULL AND NOT public.is_staff(auth.uid()) THEN
    IF NEW.email IS NULL OR btrim(NEW.email) = '' OR length(NEW.email) > 254
       OR NEW.email !~ '^[^@\s]+@[^@\s.]+\.[^@\s]+$' THEN
      RAISE EXCEPTION 'Invalid email address';
    END IF;
    IF length(COALESCE(NEW.first_name, '')) > 100
       OR length(COALESCE(NEW.last_name, '')) > 100 THEN
      RAISE EXCEPTION 'Name is too long';
    END IF;
    IF NEW.first_name IS NULL OR btrim(NEW.first_name) = ''
       OR NEW.last_name IS NULL OR btrim(NEW.last_name) = '' THEN
      RAISE EXCEPTION 'First and last name are required';
    END IF;
    -- Force safe defaults regardless of client payload
    NEW.review_status := 'pending'::review_status;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.reviewer_notes := NULL;
    NEW.background_verification_notes := NULL;
    NEW.submitted_by_staff := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_public_application_insert ON public.applications;
CREATE TRIGGER validate_public_application_insert
BEFORE INSERT ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.validate_public_application_insert();

-- Scope the public insert policy to anon/authenticated roles explicitly
DROP POLICY IF EXISTS "Public can submit application with email" ON public.applications;
CREATE POLICY "Public can submit application with email"
ON public.applications
FOR INSERT
TO anon, authenticated
WITH CHECK (
  email IS NOT NULL AND email <> ''
  AND user_id IS NULL
  AND review_status = 'pending'::review_status
  AND reviewed_by IS NULL AND reviewed_at IS NULL
  AND reviewer_notes IS NULL AND background_verification_notes IS NULL
  AND mvr_status = 'not_started'::mvr_status
  AND ch_status = 'not_started'::mvr_status
  AND pei_status = 'not_started'::pei_applicant_status
  AND COALESCE(submitted_by_staff, false) = false
);

-- 2) Exact operator-id folder matching for ica-signatures contractor files
DROP POLICY IF EXISTS "Operators can view their own ICA signatures" ON storage.objects;
CREATE POLICY "Operators can view their own ICA signatures"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'ica-signatures'
  AND (
    (storage.foldername(name))[1] = 'carrier-default'
    OR (
      (storage.foldername(name))[1] = 'contractor'
      AND EXISTS (
        SELECT 1 FROM public.operators o
        WHERE o.user_id = auth.uid()
          AND substring(storage.filename(objects.name) from 1 for 37) = (o.id)::text || '-'
      )
    )
  )
);

DROP POLICY IF EXISTS "Operators can upload their own contractor signature" ON storage.objects;
CREATE POLICY "Operators can upload their own contractor signature"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'ica-signatures'
  AND (storage.foldername(name))[1] = 'contractor'
  AND EXISTS (
    SELECT 1 FROM public.operators o
    WHERE o.user_id = auth.uid()
      AND substring(storage.filename(objects.name) from 1 for 37) = (o.id)::text || '-'
  )
);

DROP POLICY IF EXISTS "Truck owners can view contractor signature" ON storage.objects;
CREATE POLICY "Truck owners can view contractor signature"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'ica-signatures'
  AND (
    (storage.foldername(name))[1] = 'carrier-default'
    OR (
      (storage.foldername(name))[1] = 'contractor'
      AND EXISTS (
        SELECT 1 FROM public.truck_owners t
        WHERE t.user_id = auth.uid()
          AND substring(storage.filename(objects.name) from 1 for 37) = (t.operator_id)::text || '-'
      )
    )
  )
);

DROP POLICY IF EXISTS "Truck owners can upload contractor signature" ON storage.objects;
CREATE POLICY "Truck owners can upload contractor signature"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'ica-signatures'
  AND (storage.foldername(name))[1] = 'contractor'
  AND EXISTS (
    SELECT 1 FROM public.truck_owners t
    WHERE t.user_id = auth.uid()
      AND substring(storage.filename(objects.name) from 1 for 37) = (t.operator_id)::text || '-'
  )
);
