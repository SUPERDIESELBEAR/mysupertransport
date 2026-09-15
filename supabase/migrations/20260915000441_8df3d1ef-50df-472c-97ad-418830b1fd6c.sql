DO $$
DECLARE
  v_company uuid := (SELECT id FROM public.carrier_profile);
  t text;
  tables text[] := ARRAY['settlements','settlement_line_items','settlement_withheld_loads',
                         'dispatch_settlements','dispatch_settlement_line_items',
                         'dispatch_settlement_load_contributions','dispatch_settlement_charge_verdicts'];
BEGIN
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'No carrier row: refusing to backfill tenancy.';
  END IF;
  FOREACH t IN ARRAY tables LOOP
    -- Approved route for immutability-locked tables: constant default fills every
    -- existing row without firing any row trigger, then the default is dropped.
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN company_id uuid NOT NULL DEFAULT %L', t, v_company);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id DROP DEFAULT', t);
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (company_id) REFERENCES public.carrier_profile(id) ON DELETE RESTRICT', t, t||'_company_id_fkey');
    EXECUTE format('CREATE INDEX %I ON public.%I (company_id)', 'idx_'||t||'_company_id', t);
    EXECUTE format('CREATE TRIGGER aa_stamp_tenant_company_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id()', t);
  END LOOP;
END $$;

ALTER TABLE public.dispatch_settlements DROP CONSTRAINT IF EXISTS dispatch_settlements_payee_period_key;
DROP INDEX IF EXISTS public.dispatch_settlements_payee_period_key;
CREATE UNIQUE INDEX dispatch_settlements_company_payee_period_uniq
  ON public.dispatch_settlements (company_id, payee_key, period_month);