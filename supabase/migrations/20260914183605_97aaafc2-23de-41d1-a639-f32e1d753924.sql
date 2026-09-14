-- Tenancy batch B4: the 31 EMPTY tables.
-- Same shape as B2/B3: nullable column -> bare-scalar backfill -> NOT NULL, no
-- default at any point, FK to carrier_profile(id) ON DELETE RESTRICT, and the
-- BEFORE INSERT stamp (sanctioned shape 1: membership resolves the company
-- server-side and overwrites whatever arrived). Every one of the 31 is
-- staff-written; none has a service-role or anonymous insert path, so shape 2
-- is not used anywhere in this batch.
--
-- The backfill is written even though every table holds zero rows: it keeps the
-- pattern identical across batches and it is the statement that raises 21000
-- rather than picking a carrier if a second one ever exists.
DO $b4$
DECLARE
  t text;
  tables text[] := ARRAY[
    'broker_contacts','broker_do_not_load_history','broker_documents',
    'broker_factoring_history','broker_notes','cash_advances','company_documents',
    'deduction_installments','deductions','detention_claims','dispatch_deductions',
    'dispatch_settlement_rates_history','document_send_log',
    'driver_staff_contact_suppressions','driver_staff_contacts',
    'ica_amendment_units','ica_amendments','inspection_cycles',
    'inspection_program_payments','pandadoc_documents','pay_policy_assignments',
    'rm_deposit_transactions','rm_deposits','settlement_settings_history',
    'staff_email_overrides','staff_help_messages','staff_help_threads',
    'staff_messaging_settings','truck_plate_history','truck_state_permits',
    'vacant_units'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN company_id uuid', t);

    EXECUTE format(
      'UPDATE public.%I SET company_id = (SELECT id FROM public.carrier_profile) WHERE company_id IS NULL', t);

    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id SET NOT NULL', t);

    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (company_id) REFERENCES public.carrier_profile(id) ON DELETE RESTRICT',
      t, t || '_company_id_fkey');

    EXECUTE format('CREATE INDEX %I ON public.%I (company_id)', 'idx_' || t || '_company_id', t);

    EXECUTE format(
      'CREATE TRIGGER aa_stamp_tenant_company_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id()',
      t);
  END LOOP;
END
$b4$;