-- Follow-up to 0035, from its own proof. 0035 bound the two shared storage
-- prefixes to the caller's carrier, and the proof showed the applicant hole shut
-- — but it ALSO showed a regression I caused: a driver and a truck owner went
-- from seeing the carrier-default signature to seeing 0 of it.
--
-- Why. A subquery inside an RLS policy runs as the CALLER, so it is subject to the
-- policies of the table it reads. public.carrier_signature_settings is readable
-- only by staff ("Staff can view carrier signature settings") with a restrictive
-- tenant_isolation policy over it, so for a driver the EXISTS could never be true
-- however right his company was. The agreement screen would have shown a broken
-- signature image. Caught before it shipped because the proof asserted the people
-- who SHOULD still see the file, not only the person who should not.
--
-- The fix is the pattern this database already uses for exactly this problem:
-- resolve the fact in a SECURITY DEFINER helper with a pinned search_path, so the
-- company comparison does not depend on the caller's read rights on the row that
-- records it. Both helpers are granted the same way as public.current_company_id()
-- — EXECUTE to authenticated and service_role, never to PUBLIC or anon — and both
-- leak nothing: each answers one yes/no about ONE path, and only ever about the
-- caller's own carrier.
--
-- inspection_documents gets the same treatment even though it happened to work,
-- because it only worked by accident: its SELECT policy lets any signed-in user
-- read company_wide rows, so the storage rule was leaning on a permission that is
-- itself broader than it should be. Leaning on it would mean tightening that
-- policy later silently breaks every driver's binder.
--
-- UNDO:
--   the three policies as 0035 created them (inline EXISTS against
--   public.inspection_documents / public.carrier_signature_settings), then
--   DROP FUNCTION public.is_company_inspection_doc_of_caller(text);
--   DROP FUNCTION public.is_carrier_default_signature_of_caller(text);

CREATE OR REPLACE FUNCTION public.is_company_inspection_doc_of_caller(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.inspection_documents d
    WHERE d.file_path = p_name
      AND d.company_id IS NOT NULL
      AND d.company_id = public.current_company_id()
  );
$$;

REVOKE ALL ON FUNCTION public.is_company_inspection_doc_of_caller(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_company_inspection_doc_of_caller(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_company_inspection_doc_of_caller(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_inspection_doc_of_caller(text) TO service_role;

CREATE OR REPLACE FUNCTION public.is_carrier_default_signature_of_caller(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.carrier_signature_settings s
    WHERE s.signature_url = p_name
      AND s.company_id IS NOT NULL
      AND s.company_id = public.current_company_id()
  );
$$;

REVOKE ALL ON FUNCTION public.is_carrier_default_signature_of_caller(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_carrier_default_signature_of_caller(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_carrier_default_signature_of_caller(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_carrier_default_signature_of_caller(text) TO service_role;

DROP POLICY IF EXISTS "Drivers can view company and own inspection docs" ON storage.objects;

CREATE POLICY "Drivers can view company and own inspection docs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'inspection-documents'
  AND (
    (
      (storage.foldername(name))[1] = 'company'
      AND (SELECT public.is_company_inspection_doc_of_caller(storage.objects.name))
    )
    OR (
      (storage.foldername(name))[1] = 'driver'
      AND (storage.foldername(name))[2] = (auth.uid())::text
    )
  )
);

DROP POLICY IF EXISTS "Truck owners can view contractor signature" ON storage.objects;

CREATE POLICY "Truck owners can view contractor signature"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'ica-signatures'
  AND (
    (
      (storage.foldername(name))[1] = 'carrier-default'
      AND (SELECT public.is_carrier_default_signature_of_caller(storage.objects.name))
    )
    OR (
      (storage.foldername(name))[1] = 'contractor'
      AND EXISTS (
        SELECT 1 FROM public.truck_owners t
        WHERE t.user_id = auth.uid()
          AND SUBSTRING(storage.filename(storage.objects.name) FROM 1 FOR 37) = ((t.operator_id)::text || '-')
      )
    )
  )
);

DROP POLICY IF EXISTS "Operators can view their own ICA signatures" ON storage.objects;

CREATE POLICY "Operators can view their own ICA signatures"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'ica-signatures'
  AND (
    (
      (storage.foldername(name))[1] = 'carrier-default'
      AND (SELECT public.is_carrier_default_signature_of_caller(storage.objects.name))
    )
    OR (
      (storage.foldername(name))[1] = 'contractor'
      AND EXISTS (
        SELECT 1 FROM public.operators o
        WHERE o.user_id = auth.uid()
          AND SUBSTRING(storage.filename(storage.objects.name) FROM 1 FOR 37) = ((o.id)::text || '-')
      )
    )
  )
);