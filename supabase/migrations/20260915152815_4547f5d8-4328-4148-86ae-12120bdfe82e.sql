-- BATCH B6 GROUP 1 — the ELD / RODS hours-of-service set.
-- Populated tables take the approved constant-DEFAULT-then-DROP-DEFAULT route:
-- rods_days / rods_events carry certification locks, rods_divergences is
-- append-only, and a backfill UPDATE would move updated_at on federal records.
-- The read-only derivation check ran BEFORE this migration and agreed on every
-- row (rods_days 2/2 -> 1 company, rods_correction_requests 3/3 -> 1 company,
-- blank_log_acknowledgments 1/1 -> 1 company), so no trigger was suspended.

-- Populated, lock- or stamp-triggered: constant default, then dropped.
ALTER TABLE public.rods_days
  ADD COLUMN company_id uuid NOT NULL DEFAULT '6b54d0e6-8743-4284-b55b-8cd094b093dd';
ALTER TABLE public.rods_days ALTER COLUMN company_id DROP DEFAULT;

ALTER TABLE public.rods_correction_requests
  ADD COLUMN company_id uuid NOT NULL DEFAULT '6b54d0e6-8743-4284-b55b-8cd094b093dd';
ALTER TABLE public.rods_correction_requests ALTER COLUMN company_id DROP DEFAULT;

ALTER TABLE public.blank_log_acknowledgments
  ADD COLUMN company_id uuid NOT NULL DEFAULT '6b54d0e6-8743-4284-b55b-8cd094b093dd';
ALTER TABLE public.blank_log_acknowledgments ALTER COLUMN company_id DROP DEFAULT;

-- Empty tables: nullable add then NOT NULL, no default at any point.
ALTER TABLE public.rods_events ADD COLUMN company_id uuid;
ALTER TABLE public.rods_events ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.rods_amendments ADD COLUMN company_id uuid;
ALTER TABLE public.rods_amendments ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.rods_divergences ADD COLUMN company_id uuid;
ALTER TABLE public.rods_divergences ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.rods_unlock_events ADD COLUMN company_id uuid;
ALTER TABLE public.rods_unlock_events ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.eld_extension_requests ADD COLUMN company_id uuid;
ALTER TABLE public.eld_extension_requests ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.eld_malfunction_events ADD COLUMN company_id uuid;
ALTER TABLE public.eld_malfunction_events ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.eld_devices ADD COLUMN company_id uuid;
ALTER TABLE public.eld_devices ALTER COLUMN company_id SET NOT NULL;

-- FK RESTRICT, index, stamp trigger on all ten.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'rods_days','rods_events','rods_amendments','rods_divergences',
    'rods_correction_requests','rods_unlock_events','blank_log_acknowledgments',
    'eld_extension_requests','eld_malfunction_events','eld_devices'
  ]
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (company_id) '
      || 'REFERENCES public.carrier_profile(id) ON DELETE RESTRICT',
      t, t || '_company_id_fkey');
    EXECUTE format('CREATE INDEX %I ON public.%I (company_id)', 'idx_' || t || '_company_id', t);
    EXECUTE format(
      'CREATE TRIGGER aa_stamp_tenant_company_id BEFORE INSERT ON public.%I '
      || 'FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id()', t);
  END LOOP;
END $$;