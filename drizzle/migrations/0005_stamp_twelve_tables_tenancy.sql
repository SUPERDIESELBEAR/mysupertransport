-- Twelve remaining unstamped per-carrier tables: company_id, derived backfill,
-- server-side stamp trigger, and the pilot's exact restrictive tenant policy.

-- Generic actor-based stamp: reads the same three sources as current_company_id(),
-- keyed off a user-id column named in TG_ARGV[0]. Used where the row's tenancy
-- follows the person it belongs to and the writer may be a service-role function.
CREATE OR REPLACE FUNCTION public.stamp_company_from_user_ref()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_col text := TG_ARGV[0];
  v_uid uuid := NULLIF(to_jsonb(NEW) ->> TG_ARGV[0], '')::uuid;
  v_company uuid;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT CASE WHEN count(*) = 1 THEN (array_agg(d.company_id))[1] END
      INTO v_company
      FROM (
        SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = v_uid
        UNION
        SELECT o.company_id  FROM public.operators o       WHERE o.user_id  = v_uid
        UNION
        SELECT t.company_id  FROM public.truck_owners t    WHERE t.user_id  = v_uid
      ) d
     WHERE d.company_id IS NOT NULL;
  END IF;

  IF v_company IS NULL THEN
    v_company := public.current_company_id();
  END IF;

  IF v_company IS NULL THEN
    RAISE EXCEPTION
      'Cannot resolve a company for this %.% row from %: refusing to write without tenancy.',
      TG_TABLE_SCHEMA, TG_TABLE_NAME, v_col
      USING ERRCODE = '42501';
  END IF;

  NEW.company_id := v_company;
  RETURN NEW;
END;
$$;

-- Fuel children: tenancy follows the IMPORT BATCH, never the driver, because an
-- unmatched fuel row has no driver at all.
CREATE OR REPLACE FUNCTION public.stamp_company_from_fuel_batch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE v_company uuid;
BEGIN
  SELECT b.company_id INTO v_company
    FROM public.fuel_import_batches b WHERE b.id = NEW.batch_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'No company for fuel import batch %: refusing to write %',
      NEW.batch_id, TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  NEW.company_id := v_company;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.stamp_company_from_fuel_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE v_company uuid;
BEGIN
  SELECT t.company_id INTO v_company
    FROM public.fuel_transactions t WHERE t.id = NEW.transaction_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'No company for fuel transaction %: refusing to write %',
      NEW.transaction_id, TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  NEW.company_id := v_company;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.stamp_company_from_osas_sheet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE v_company uuid;
BEGIN
  SELECT s.company_id INTO v_company
    FROM public.onboard_assignment_sheets s WHERE s.id = NEW.sheet_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'No company for assignment sheet %: refusing to write %',
      NEW.sheet_id, TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  NEW.company_id := v_company;
  RETURN NEW;
END;
$$;

-- 1. fuel_import_batches: imported_by -> profiles -> company_members
ALTER TABLE public.fuel_import_batches
  ADD COLUMN company_id uuid REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
UPDATE public.fuel_import_batches b
   SET company_id = cm.company_id
  FROM public.profiles p
  JOIN public.company_members cm ON cm.user_id = p.user_id
 WHERE p.id = b.imported_by AND b.company_id IS NULL;
ALTER TABLE public.fuel_import_batches ALTER COLUMN company_id SET NOT NULL;
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT OR UPDATE ON public.fuel_import_batches
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();
CREATE POLICY tenant_isolation ON public.fuel_import_batches
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

-- 2. fuel_transactions: batch_id -> fuel_import_batches
ALTER TABLE public.fuel_transactions
  ADD COLUMN company_id uuid REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
UPDATE public.fuel_transactions t
   SET company_id = b.company_id
  FROM public.fuel_import_batches b
 WHERE b.id = t.batch_id AND t.company_id IS NULL;
ALTER TABLE public.fuel_transactions ALTER COLUMN company_id SET NOT NULL;
CREATE TRIGGER aa_stamp_company_from_fuel_batch
  BEFORE INSERT OR UPDATE ON public.fuel_transactions
  FOR EACH ROW EXECUTE FUNCTION public.stamp_company_from_fuel_batch();
CREATE POLICY tenant_isolation ON public.fuel_transactions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

-- 3. fuel_transaction_lines: transaction_id -> fuel_transactions
ALTER TABLE public.fuel_transaction_lines
  ADD COLUMN company_id uuid REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
UPDATE public.fuel_transaction_lines l
   SET company_id = t.company_id
  FROM public.fuel_transactions t
 WHERE t.id = l.transaction_id AND l.company_id IS NULL;
ALTER TABLE public.fuel_transaction_lines ALTER COLUMN company_id SET NOT NULL;
CREATE TRIGGER aa_stamp_company_from_fuel_transaction
  BEFORE INSERT OR UPDATE ON public.fuel_transaction_lines
  FOR EACH ROW EXECUTE FUNCTION public.stamp_company_from_fuel_transaction();
CREATE POLICY tenant_isolation ON public.fuel_transaction_lines
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

-- 4. fuel_disagreement_acceptances: transaction_id -> fuel_transactions (0 rows)
ALTER TABLE public.fuel_disagreement_acceptances
  ADD COLUMN company_id uuid REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
UPDATE public.fuel_disagreement_acceptances a
   SET company_id = t.company_id
  FROM public.fuel_transactions t
 WHERE t.id = a.transaction_id AND a.company_id IS NULL;
ALTER TABLE public.fuel_disagreement_acceptances ALTER COLUMN company_id SET NOT NULL;
CREATE TRIGGER aa_stamp_company_from_fuel_transaction
  BEFORE INSERT OR UPDATE ON public.fuel_disagreement_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.stamp_company_from_fuel_transaction();
CREATE POLICY tenant_isolation ON public.fuel_disagreement_acceptances
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

-- 5. operator_broadcasts: sent_by -> membership (service-role edge writer)
ALTER TABLE public.operator_broadcasts
  ADD COLUMN company_id uuid REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
UPDATE public.operator_broadcasts b
   SET company_id = d.company_id
  FROM (
    SELECT cm.user_id AS uid, cm.company_id FROM public.company_members cm
    UNION
    SELECT o.user_id, o.company_id FROM public.operators o WHERE o.user_id IS NOT NULL
    UNION
    SELECT t.user_id, t.company_id FROM public.truck_owners t WHERE t.user_id IS NOT NULL
  ) d
 WHERE d.uid = b.sent_by AND b.company_id IS NULL;
ALTER TABLE public.operator_broadcasts ALTER COLUMN company_id SET NOT NULL;
CREATE TRIGGER aa_stamp_company_from_user_ref
  BEFORE INSERT OR UPDATE ON public.operator_broadcasts
  FOR EACH ROW EXECUTE FUNCTION public.stamp_company_from_user_ref('sent_by');
CREATE POLICY tenant_isolation ON public.operator_broadcasts
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

-- 6. operator_departing_events: operator_id -> operators
ALTER TABLE public.operator_departing_events
  ADD COLUMN company_id uuid REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
UPDATE public.operator_departing_events e
   SET company_id = o.company_id
  FROM public.operators o
 WHERE o.id = e.operator_id AND e.company_id IS NULL;
ALTER TABLE public.operator_departing_events ALTER COLUMN company_id SET NOT NULL;
CREATE TRIGGER aa_stamp_company_from_operator
  BEFORE INSERT OR UPDATE ON public.operator_departing_events
  FOR EACH ROW EXECUTE FUNCTION public.stamp_company_from_operator();
CREATE POLICY tenant_isolation ON public.operator_departing_events
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

-- 7. operator_parking_events: operator_id -> operators
ALTER TABLE public.operator_parking_events
  ADD COLUMN company_id uuid REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
UPDATE public.operator_parking_events e
   SET company_id = o.company_id
  FROM public.operators o
 WHERE o.id = e.operator_id AND e.company_id IS NULL;
ALTER TABLE public.operator_parking_events ALTER COLUMN company_id SET NOT NULL;
CREATE TRIGGER aa_stamp_company_from_operator
  BEFORE INSERT OR UPDATE ON public.operator_parking_events
  FOR EACH ROW EXECUTE FUNCTION public.stamp_company_from_operator();
CREATE POLICY tenant_isolation ON public.operator_parking_events
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

-- 8. equipment_return_confirmations: operator_id -> operators (0 rows)
ALTER TABLE public.equipment_return_confirmations
  ADD COLUMN company_id uuid REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
UPDATE public.equipment_return_confirmations c
   SET company_id = o.company_id
  FROM public.operators o
 WHERE o.id = c.operator_id AND c.company_id IS NULL;
ALTER TABLE public.equipment_return_confirmations ALTER COLUMN company_id SET NOT NULL;
CREATE TRIGGER aa_stamp_company_from_operator
  BEFORE INSERT OR UPDATE ON public.equipment_return_confirmations
  FOR EACH ROW EXECUTE FUNCTION public.stamp_company_from_operator();
CREATE POLICY tenant_isolation ON public.equipment_return_confirmations
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

-- 9. driver_optional_docs: driver_id is the driver's USER id (0 rows)
ALTER TABLE public.driver_optional_docs
  ADD COLUMN company_id uuid REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
UPDATE public.driver_optional_docs d
   SET company_id = o.company_id
  FROM public.operators o
 WHERE o.user_id = d.driver_id AND d.company_id IS NULL;
ALTER TABLE public.driver_optional_docs ALTER COLUMN company_id SET NOT NULL;
CREATE TRIGGER aa_stamp_company_from_user_ref
  BEFORE INSERT OR UPDATE ON public.driver_optional_docs
  FOR EACH ROW EXECUTE FUNCTION public.stamp_company_from_user_ref('driver_id');
CREATE POLICY tenant_isolation ON public.driver_optional_docs
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

-- 10. onboard_assignment_sheet_sends: sheet_id -> onboard_assignment_sheets
ALTER TABLE public.onboard_assignment_sheet_sends
  ADD COLUMN company_id uuid REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
UPDATE public.onboard_assignment_sheet_sends s
   SET company_id = sh.company_id
  FROM public.onboard_assignment_sheets sh
 WHERE sh.id = s.sheet_id AND s.company_id IS NULL;
ALTER TABLE public.onboard_assignment_sheet_sends ALTER COLUMN company_id SET NOT NULL;
CREATE TRIGGER aa_stamp_company_from_osas_sheet
  BEFORE INSERT OR UPDATE ON public.onboard_assignment_sheet_sends
  FOR EACH ROW EXECUTE FUNCTION public.stamp_company_from_osas_sheet();
CREATE POLICY tenant_isolation ON public.onboard_assignment_sheet_sends
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

-- 11. staff_event_acknowledgments: user_id -> membership
ALTER TABLE public.staff_event_acknowledgments
  ADD COLUMN company_id uuid REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
UPDATE public.staff_event_acknowledgments a
   SET company_id = d.company_id
  FROM (
    SELECT cm.user_id AS uid, cm.company_id FROM public.company_members cm
    UNION
    SELECT o.user_id, o.company_id FROM public.operators o WHERE o.user_id IS NOT NULL
    UNION
    SELECT t.user_id, t.company_id FROM public.truck_owners t WHERE t.user_id IS NOT NULL
  ) d
 WHERE d.uid = a.user_id AND a.company_id IS NULL;
ALTER TABLE public.staff_event_acknowledgments ALTER COLUMN company_id SET NOT NULL;
CREATE TRIGGER aa_stamp_company_from_user_ref
  BEFORE INSERT OR UPDATE ON public.staff_event_acknowledgments
  FOR EACH ROW EXECUTE FUNCTION public.stamp_company_from_user_ref('user_id');
CREATE POLICY tenant_isolation ON public.staff_event_acknowledgments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

-- 12. staff_help_query_log: user_id -> membership (service-role edge writer)
ALTER TABLE public.staff_help_query_log
  ADD COLUMN company_id uuid REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
UPDATE public.staff_help_query_log q
   SET company_id = d.company_id
  FROM (
    SELECT cm.user_id AS uid, cm.company_id FROM public.company_members cm
    UNION
    SELECT o.user_id, o.company_id FROM public.operators o WHERE o.user_id IS NOT NULL
    UNION
    SELECT t.user_id, t.company_id FROM public.truck_owners t WHERE t.user_id IS NOT NULL
  ) d
 WHERE d.uid = q.user_id AND q.company_id IS NULL;
ALTER TABLE public.staff_help_query_log ALTER COLUMN company_id SET NOT NULL;
CREATE TRIGGER aa_stamp_company_from_user_ref
  BEFORE INSERT OR UPDATE ON public.staff_help_query_log
  FOR EACH ROW EXECUTE FUNCTION public.stamp_company_from_user_ref('user_id');
CREATE POLICY tenant_isolation ON public.staff_help_query_log
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

CREATE INDEX IF NOT EXISTS idx_fuel_import_batches_company ON public.fuel_import_batches(company_id);
CREATE INDEX IF NOT EXISTS idx_fuel_transactions_company ON public.fuel_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_fuel_transaction_lines_company ON public.fuel_transaction_lines(company_id);
CREATE INDEX IF NOT EXISTS idx_fuel_disagreement_acceptances_company ON public.fuel_disagreement_acceptances(company_id);
CREATE INDEX IF NOT EXISTS idx_operator_broadcasts_company ON public.operator_broadcasts(company_id);
CREATE INDEX IF NOT EXISTS idx_operator_departing_events_company ON public.operator_departing_events(company_id);
CREATE INDEX IF NOT EXISTS idx_operator_parking_events_company ON public.operator_parking_events(company_id);
CREATE INDEX IF NOT EXISTS idx_equipment_return_confirmations_company ON public.equipment_return_confirmations(company_id);
CREATE INDEX IF NOT EXISTS idx_driver_optional_docs_company ON public.driver_optional_docs(company_id);
CREATE INDEX IF NOT EXISTS idx_onboard_assignment_sheet_sends_company ON public.onboard_assignment_sheet_sends(company_id);
CREATE INDEX IF NOT EXISTS idx_staff_event_acknowledgments_company ON public.staff_event_acknowledgments(company_id);
CREATE INDEX IF NOT EXISTS idx_staff_help_query_log_company ON public.staff_help_query_log(company_id);