DO $mig$
DECLARE
  v_company uuid;
  t text;
  -- tables with UPDATE-firing triggers: constant-default route (no row UPDATE)
  locked text[] := ARRAY['active_dispatch','claim_flags','lease_terminations','load_charges','truck_dot_inspections','truck_owners'];
  plain  text[] := ARRAY['cert_reminders','claim_flag_history','document_version_history','equipment_assignments',
                         'equipment_serial_conflict_dismissals','mo_plate_assignments','truck_maintenance_records',
                         'load_references','load_reference_citations','parser_diagnostics','rate_con_ingest_queue'];
BEGIN
  -- bare scalar subquery: raises 21000 the moment a second carrier exists
  v_company := (SELECT id FROM public.carrier_profile);
  IF v_company IS NULL THEN RAISE EXCEPTION 'no carrier_profile row'; END IF;

  FOREACH t IN ARRAY locked LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN company_id uuid NOT NULL DEFAULT %L', t, v_company);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id DROP DEFAULT', t);
  END LOOP;

  FOREACH t IN ARRAY plain LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN company_id uuid', t);
    EXECUTE format('UPDATE public.%I SET company_id = (SELECT id FROM public.carrier_profile) WHERE company_id IS NULL', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id SET NOT NULL', t);
  END LOOP;

  FOREACH t IN ARRAY locked || plain LOOP
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (company_id) REFERENCES public.carrier_profile(id) ON DELETE RESTRICT', t, t||'_company_id_fkey');
    EXECUTE format('CREATE INDEX %I ON public.%I (company_id)', t||'_company_id_idx', t);
    EXECUTE format('CREATE TRIGGER aa_stamp_tenant_company_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id()', t);
  END LOOP;
END
$mig$;

-- per-company uniqueness (constraints dropped before their indexes)
ALTER TABLE public.equipment_serial_conflict_dismissals
  DROP CONSTRAINT IF EXISTS equipment_serial_conflict_dismissals_conflict_key_key;
DROP INDEX IF EXISTS public.equipment_serial_conflict_dismissals_conflict_key_key;
CREATE UNIQUE INDEX equipment_serial_conflict_dismissals_company_key_uniq
  ON public.equipment_serial_conflict_dismissals (company_id, conflict_key);

ALTER TABLE public.rate_con_ingest_queue
  DROP CONSTRAINT IF EXISTS rate_con_ingest_queue_attachment_sha256_key;
DROP INDEX IF EXISTS public.rate_con_ingest_queue_attachment_sha256_key;
CREATE UNIQUE INDEX rate_con_ingest_queue_company_attachment_sha256_uniq
  ON public.rate_con_ingest_queue (company_id, attachment_sha256)
  WHERE attachment_sha256 IS NOT NULL;
