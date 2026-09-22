-- Security findings lov_db_storage_objects_owner_unbound_v1_be8d2e5f24e7bed8,
-- _ccc79bed9d0d4369 and _d7189978412e7a41. Outside the pass this was sent, done
-- on the owner's instruction of 2026-09-22 with two conditions: scope by COMPANY
-- the way the tenancy rules do, and prove nothing that legitimately uses these
-- files breaks.
--
-- What was actually wrong. Three SELECT policies on storage.objects each had a
-- branch with NO binding at all:
--   inspection-documents, prefix 'company/'   -> readable by ANY signed-in user
--   ica-signatures,       prefix 'carrier-default/' -> same, in two policies
-- The per-driver and per-truck-owner branches were already bound correctly
-- (driver/<auth.uid()>/..., and the contractor signature matched to the caller's
-- operator or truck_owner row); those are unchanged.
--
-- The company binding is real, not a membership test. Both shared prefixes have a
-- row carrying the owning company and the exact storage path:
--   public.inspection_documents(file_path, company_id)
--   public.carrier_signature_settings(signature_url, company_id)
-- so each object is matched to ITS company and compared with
-- public.current_company_id() — the same resolver the tenant policies use, which
-- reads company_members, the caller's own operator row and his truck_owner row
-- together and returns NULL unless exactly one company resolves. An applicant
-- holds none of the three, so it is NULL for him and every branch fails closed.
--
-- Wrapped in (SELECT ...) so the resolver runs once per statement, not once per
-- object — the defect migration 0028 had to fix on the pay-policy policies.
--
-- Checked before changing anything, because a strict binding can orphan a file:
--   * 8 objects carry the 'company/' prefix; 7 have an inspection_documents row
--     for this company. The eighth, company/accident-packet/1774527172990.pdf, has
--     none — it is served by public.resource_documents as a stored SIGNED url
--     valid to 2031, and a signed url does not consult RLS at all, so the drivers'
--     Resources screen is unaffected by this change.
--   * the one carrier-default signature is carrier_signature_settings.signature_url
--     for company 6b54d0e6, so it matches.
--   * the signed-out /inspect share link reads the stored file_url created at
--     upload time; it never SELECTs storage.objects as a client, so it is
--     unaffected.
--
-- KNOWN LIMIT, recorded rather than hidden: neither shared prefix carries a
-- company segment in its path ('company/...', 'carrier-default/...'). The binding
-- above works because the owning row does. If a second carrier is ever onboarded,
-- new shared uploads must be pathed 'company/<company_id>/...' so the object is
-- self-describing even without its row.
--
-- UNDO: recreate the three policies with the unbound branches
--   ((storage.foldername(name))[1] = 'company') and
--   ((storage.foldername(name))[1] = 'carrier-default')
-- as they stood before this migration.

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
      AND EXISTS (
        SELECT 1 FROM public.inspection_documents d
        WHERE d.file_path = storage.objects.name
          AND d.company_id = (SELECT public.current_company_id())
      )
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
      AND EXISTS (
        SELECT 1 FROM public.carrier_signature_settings s
        WHERE s.signature_url = storage.objects.name
          AND s.company_id = (SELECT public.current_company_id())
      )
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
      AND EXISTS (
        SELECT 1 FROM public.carrier_signature_settings s
        WHERE s.signature_url = storage.objects.name
          AND s.company_id = (SELECT public.current_company_id())
      )
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