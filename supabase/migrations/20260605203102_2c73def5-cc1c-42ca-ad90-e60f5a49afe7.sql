
-- ============================================================================
-- Security hardening: storage RLS scoping + onboarding_status operator guard
-- ============================================================================

-- ---------- application-documents bucket ------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view application documents" ON storage.objects;
DROP POLICY IF EXISTS "Public can upload application documents" ON storage.objects;

-- Only staff can SELECT directly; everyone else accesses via signed URLs that
-- staff-side code generates. Applicants never read the bucket back.
-- (Staff SELECT policy "Staff can view application documents" already exists.)

-- Anonymous applicants may upload, but ONLY under the applications/ prefix.
CREATE POLICY "Anyone can upload application docs under applications/"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'application-documents'
    AND (storage.foldername(name))[1] = 'applications'
  );

-- ---------- signatures bucket -----------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view signatures" ON storage.objects;
DROP POLICY IF EXISTS "Public can upload signatures" ON storage.objects;

-- Staff-only SELECT (existing "Staff can view signatures" policy remains).
-- Anonymous applicants may upload only under signatures/ prefix.
CREATE POLICY "Anyone can upload signatures under signatures/"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'signatures'
    AND (storage.foldername(name))[1] = 'signatures'
  );

-- ---------- ica-signatures bucket -------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view ICA signatures" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload ICA signatures" ON storage.objects;

-- Staff: full read
CREATE POLICY "Staff can view ICA signatures"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'ica-signatures' AND public.is_staff(auth.uid()));

-- Operators: read their own contractor/{operatorId}-* signatures + carrier-default/*
CREATE POLICY "Operators can view their own ICA signatures"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'ica-signatures'
    AND auth.uid() IS NOT NULL
    AND (
      (storage.foldername(name))[1] = 'carrier-default'
      OR (
        (storage.foldername(name))[1] = 'contractor'
        AND EXISTS (
          SELECT 1 FROM public.operators o
          WHERE o.user_id = auth.uid()
            AND split_part(
                  regexp_replace(name, '^contractor/', ''),
                  '-', 1
                ) = o.id::text
        )
      )
    )
  );

-- Staff: full write
CREATE POLICY "Staff can upload ICA signatures"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'ica-signatures' AND public.is_staff(auth.uid()));

-- Operators: upload only contractor/{their-operator-id}-*.png
CREATE POLICY "Operators can upload their own contractor signature"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'ica-signatures'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = 'contractor'
    AND EXISTS (
      SELECT 1 FROM public.operators o
      WHERE o.user_id = auth.uid()
        AND split_part(
              regexp_replace(name, '^contractor/', ''),
              '-', 1
            ) = o.id::text
    )
  );

-- ---------- inspection-documents bucket -------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view inspection docs" ON storage.objects;

CREATE POLICY "Staff can view all inspection docs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'inspection-documents' AND public.is_staff(auth.uid()));

-- Authenticated drivers may read company-wide docs and only their own per-driver docs.
CREATE POLICY "Drivers can view company and own inspection docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'inspection-documents'
    AND auth.uid() IS NOT NULL
    AND (
      (storage.foldername(name))[1] = 'company'
      OR (
        (storage.foldername(name))[1] = 'driver'
        AND (storage.foldername(name))[2] = auth.uid()::text
      )
    )
  );

-- ============================================================================
-- onboarding_status: restrict operator UPDATE to allowlisted columns
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_onboarding_status_operator_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Staff bypass: allow anything.
  IF public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- For operators (non-staff), forbid any change to columns outside the
  -- allowlist. Operators may only set their own decal photos, mark truck
  -- photos as requested, and mark ICA as complete during signing.
  IF NEW.decal_photo_ds_url     IS DISTINCT FROM OLD.decal_photo_ds_url
     OR NEW.decal_photo_ps_url  IS DISTINCT FROM OLD.decal_photo_ps_url
     OR NEW.truck_photos        IS DISTINCT FROM OLD.truck_photos
     OR NEW.ica_status          IS DISTINCT FROM OLD.ica_status
     OR NEW.updated_at          IS DISTINCT FROM OLD.updated_at
     OR NEW.updated_by          IS DISTINCT FROM OLD.updated_by
  THEN
    -- These changes are allowed. Now ensure NO OTHER columns changed.
    IF to_jsonb(NEW)
       - 'decal_photo_ds_url' - 'decal_photo_ps_url' - 'truck_photos'
       - 'ica_status' - 'updated_at' - 'updated_by'
       IS DISTINCT FROM
       to_jsonb(OLD)
       - 'decal_photo_ds_url' - 'decal_photo_ps_url' - 'truck_photos'
       - 'ica_status' - 'updated_at' - 'updated_by'
    THEN
      RAISE EXCEPTION 'Operators may only update their own decal photos, truck_photos, and ica_status';
    END IF;
  ELSE
    -- Nothing in the allowlist changed; ensure nothing else changed either.
    IF to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
      RAISE EXCEPTION 'Operators may only update their own decal photos, truck_photos, and ica_status';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_onboarding_status_operator_update ON public.onboarding_status;
CREATE TRIGGER trg_enforce_onboarding_status_operator_update
  BEFORE UPDATE ON public.onboarding_status
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_onboarding_status_operator_update();
