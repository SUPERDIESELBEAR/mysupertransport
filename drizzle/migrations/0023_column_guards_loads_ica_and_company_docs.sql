-- SECURITY HARDENING (scanner findings, 2026-09-21)
--
-- 1. A driver/truck owner signing an ICA could write ANY column, including
--    linehaul_split_pct and the lease dates.
-- 2. A driver assigned to a load could write ANY column, including the pay
--    rates the settlement is computed from.
-- 3. Any authenticated user could read the company-docs/ folder in storage.
--
-- Approach: keep the existing row policies (they serve legitimate writes) and
-- add BEFORE UPDATE guards that refuse changes to economic columns when the
-- caller is not staff. Denylist, so ordinary signing / driver acceptance /
-- status RPCs are untouched.
--
-- Undo (for the record, not run here):
--   DROP TRIGGER IF EXISTS aa_guard_ica_contract_terms ON public.ica_contracts;
--   DROP TRIGGER IF EXISTS aa_guard_load_financials ON public.loads;
--   DROP FUNCTION IF EXISTS public.guard_ica_contract_terms();
--   DROP FUNCTION IF EXISTS public.guard_load_financials();
--   DROP POLICY IF EXISTS "Authenticated can view company-docs" ON storage.objects;
--   CREATE POLICY "Authenticated can view company-docs" ON storage.objects
--     FOR SELECT TO authenticated USING (bucket_id = 'operator-documents'
--       AND (storage.foldername(name))[1] = 'company-docs');

-- 1. ICA: contract economics are staff-only, signing is not.
CREATE OR REPLACE FUNCTION public.guard_ica_contract_terms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.operator_id           IS DISTINCT FROM OLD.operator_id
     OR NEW.company_id         IS DISTINCT FROM OLD.company_id
     OR NEW.linehaul_split_pct IS DISTINCT FROM OLD.linehaul_split_pct
     OR NEW.lease_effective_date   IS DISTINCT FROM OLD.lease_effective_date
     OR NEW.lease_termination_date IS DISTINCT FROM OLD.lease_termination_date
     OR NEW.carrier_typed_name     IS DISTINCT FROM OLD.carrier_typed_name
     OR NEW.carrier_title          IS DISTINCT FROM OLD.carrier_title
     OR NEW.carrier_signature_url  IS DISTINCT FROM OLD.carrier_signature_url
     OR NEW.carrier_signed_at      IS DISTINCT FROM OLD.carrier_signed_at
     OR NEW.carrier_signed_by      IS DISTINCT FROM OLD.carrier_signed_by
     OR NEW.is_paper_original      IS DISTINCT FROM OLD.is_paper_original
     OR NEW.paper_recorded_at      IS DISTINCT FROM OLD.paper_recorded_at
     OR NEW.paper_recorded_by      IS DISTINCT FROM OLD.paper_recorded_by
     OR NEW.paper_scan_name        IS DISTINCT FROM OLD.paper_scan_name
     OR NEW.paper_scan_path        IS DISTINCT FROM OLD.paper_scan_path
     OR NEW.voided_at              IS DISTINCT FROM OLD.voided_at
     OR NEW.voided_by              IS DISTINCT FROM OLD.voided_by
     OR NEW.void_reason            IS DISTINCT FROM OLD.void_reason
  THEN
    RAISE EXCEPTION
      'Not authorized to change contract terms. Signing may only set your signature, typed name, deposit election and your own contact details.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.guard_ica_contract_terms() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.guard_ica_contract_terms() FROM anon;
REVOKE EXECUTE ON FUNCTION public.guard_ica_contract_terms() FROM authenticated;

DROP TRIGGER IF EXISTS aa_guard_ica_contract_terms ON public.ica_contracts;
CREATE TRIGGER aa_guard_ica_contract_terms
  BEFORE UPDATE ON public.ica_contracts
  FOR EACH ROW EXECUTE FUNCTION public.guard_ica_contract_terms();

-- 2. LOADS: pay-determining columns are staff-only.
CREATE OR REPLACE FUNCTION public.guard_load_financials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.operator_id      IS DISTINCT FROM OLD.operator_id
     OR NEW.company_id    IS DISTINCT FROM OLD.company_id
     OR NEW.broker_id     IS DISTINCT FROM OLD.broker_id
     OR NEW.load_number   IS DISTINCT FROM OLD.load_number
     OR NEW.linehaul_rate IS DISTINCT FROM OLD.linehaul_rate
     OR NEW.fsc_amount    IS DISTINCT FROM OLD.fsc_amount
     OR NEW.fsc_bundled_into_linehaul IS DISTINCT FROM OLD.fsc_bundled_into_linehaul
     OR NEW.rate_type     IS DISTINCT FROM OLD.rate_type
     OR NEW.rate_per_mile IS DISTINCT FROM OLD.rate_per_mile
     OR NEW.rate_per_ton  IS DISTINCT FROM OLD.rate_per_ton
     OR NEW.total_load_value IS DISTINCT FROM OLD.total_load_value
     OR NEW.confirmed_tons   IS DISTINCT FROM OLD.confirmed_tons
     OR NEW.loadout_relocation_fee IS DISTINCT FROM OLD.loadout_relocation_fee
     OR NEW.detention_rate_per_hour IS DISTINCT FROM OLD.detention_rate_per_hour
     OR NEW.detention_daily_cap IS DISTINCT FROM OLD.detention_daily_cap
     OR NEW.detention_free_time_minutes IS DISTINCT FROM OLD.detention_free_time_minutes
     OR NEW.permit_cost IS DISTINCT FROM OLD.permit_cost
     OR NEW.permit_recovery_method IS DISTINCT FROM OLD.permit_recovery_method
  THEN
    RAISE EXCEPTION
      'Not authorized to change a load''s pay or billing terms. Rate changes are limited to dispatch and management.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.guard_load_financials() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.guard_load_financials() FROM anon;
REVOKE EXECUTE ON FUNCTION public.guard_load_financials() FROM authenticated;

DROP TRIGGER IF EXISTS aa_guard_load_financials ON public.loads;
CREATE TRIGGER aa_guard_load_financials
  BEFORE UPDATE ON public.loads
  FOR EACH ROW EXECUTE FUNCTION public.guard_load_financials();

-- 3. STORAGE: internal company documents are staff-only.
DROP POLICY IF EXISTS "Authenticated can view company-docs" ON storage.objects;
CREATE POLICY "Authenticated can view company-docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'operator-documents'
    AND (storage.foldername(name))[1] = 'company-docs'
    AND public.is_staff(auth.uid())
  );
