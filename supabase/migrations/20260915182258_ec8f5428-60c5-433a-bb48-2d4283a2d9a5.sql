-- B6 GROUP 2 (part) — driver-written documents.
-- Five of the seven candidates. `operator_documents` and `document_acknowledgments`
-- are DELIBERATELY EXCLUDED: both have live truck-owner write paths, and a
-- membership-less truck owner resolves NULL from current_company_id(), so a NOT NULL
-- company_id would refuse his upload/acknowledgement. That needs an owner decision.

-- ---------------------------------------------------------------------------
-- ROUTE A — no rows: nullable -> NOT NULL.
-- ---------------------------------------------------------------------------
ALTER TABLE public.document_exceptions ADD COLUMN company_id uuid;
UPDATE public.document_exceptions SET company_id = (SELECT id FROM public.carrier_profile) WHERE company_id IS NULL;
ALTER TABLE public.document_exceptions ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.document_exceptions
  ADD CONSTRAINT document_exceptions_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX idx_document_exceptions_company ON public.document_exceptions(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id BEFORE INSERT ON public.document_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- ---------------------------------------------------------------------------
-- ROUTE B — rows, and NO update-firing trigger: backfill from the parent operator.
-- driver_vault_documents has no triggers at all; equipment_receipts has only
-- AFTER INSERT triggers. A backfill UPDATE on these fires nothing.
-- ---------------------------------------------------------------------------
ALTER TABLE public.driver_vault_documents ADD COLUMN company_id uuid;
UPDATE public.driver_vault_documents d SET company_id = o.company_id
  FROM public.operators o WHERE o.id = d.operator_id;
ALTER TABLE public.driver_vault_documents ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.driver_vault_documents
  ADD CONSTRAINT driver_vault_documents_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX idx_driver_vault_documents_company ON public.driver_vault_documents(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id BEFORE INSERT ON public.driver_vault_documents
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

ALTER TABLE public.equipment_receipts ADD COLUMN company_id uuid;
UPDATE public.equipment_receipts d SET company_id = o.company_id
  FROM public.operators o WHERE o.id = d.operator_id;
ALTER TABLE public.equipment_receipts ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.equipment_receipts
  ADD CONSTRAINT equipment_receipts_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX idx_equipment_receipts_company ON public.equipment_receipts(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id BEFORE INSERT ON public.equipment_receipts
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- ---------------------------------------------------------------------------
-- ROUTE C — rows AND an UPDATE-firing trigger: constant DEFAULT, then DROP it.
-- No backfill UPDATE, so no trigger is suspended.
--   driver_uploads   AFTER UPDATE notify_driver_on_upload_status_change
--                    (a backfill UPDATE would notify every driver)
--   load_documents   BEFORE UPDATE update_updated_at_column
--                    (a backfill UPDATE would move updated_at on every row)
-- The read-only derivation check ran first and found ONE company for all rows of
-- both (6/6 and 25/25), so the constant equals the derived value on every row.
-- A DEFAULT expression may not contain a subquery (0A000), so the constant is
-- written literally and this guard refuses to run unless that literal IS the
-- only carrier — the same "bare scalar" refusal, expressed as a check.
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_only uuid;
BEGIN
  SELECT id INTO STRICT v_only FROM public.carrier_profile;   -- raises 21000 / P0002
  IF v_only <> '6b54d0e6-8743-4284-b55b-8cd094b093dd'::uuid THEN
    RAISE EXCEPTION 'carrier_profile holds %, not the constant this migration was written for', v_only;
  END IF;
END $$;

ALTER TABLE public.driver_uploads
  ADD COLUMN company_id uuid NOT NULL DEFAULT '6b54d0e6-8743-4284-b55b-8cd094b093dd'::uuid;
ALTER TABLE public.driver_uploads ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE public.driver_uploads
  ADD CONSTRAINT driver_uploads_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX idx_driver_uploads_company ON public.driver_uploads(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id BEFORE INSERT ON public.driver_uploads
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

ALTER TABLE public.load_documents
  ADD COLUMN company_id uuid NOT NULL DEFAULT '6b54d0e6-8743-4284-b55b-8cd094b093dd'::uuid;
ALTER TABLE public.load_documents ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE public.load_documents
  ADD CONSTRAINT load_documents_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX idx_load_documents_company ON public.load_documents(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id BEFORE INSERT ON public.load_documents
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

COMMENT ON COLUMN public.driver_uploads.company_id IS
  'Tenancy. Stamped server-side by aa_stamp_tenant_company_id (Shape 1). Added 2026-09-15 via constant DEFAULT then DROP, because an UPDATE fires the driver notification trigger.';
COMMENT ON COLUMN public.load_documents.company_id IS
  'Tenancy. Stamped server-side by aa_stamp_tenant_company_id (Shape 1). Added 2026-09-15 via constant DEFAULT then DROP, to avoid moving updated_at on every row.';