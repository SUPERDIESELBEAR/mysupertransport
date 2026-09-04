-- Parity with every other billing table: tenancy points at carrier_profile and
-- RESTRICTS its deletion, and the actor columns point at profiles.
ALTER TABLE public.factoring_remittances
  ADD CONSTRAINT factoring_remittances_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES public.carrier_profile(id) ON DELETE RESTRICT,
  ADD CONSTRAINT factoring_remittances_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD CONSTRAINT factoring_remittances_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;