-- =====================================================================
-- MODULE 7, PASS 1 — BILLING SCHEMA ONLY.
-- Tables, enums, constraints, grants, RLS, immutability. No builder, no
-- writer, no UI, no supplemental_invoices (its Module 5 producer does not
-- exist yet).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. TENANCY. company_id from the first migration, per the record: these
--    tables are the last major shape the tenancy boundary must account
--    for, and adding a NOT NULL column to an EMPTY table is free.
--    carrier_profile is the single existing company today.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$ SELECT id FROM public.carrier_profile ORDER BY created_at LIMIT 1 $$;

REVOKE ALL ON FUNCTION public.current_company_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_company_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO service_role;

COMMENT ON FUNCTION public.current_company_id() IS
  'The tenant a row belongs to. Single-tenant today: the one carrier_profile row. '
  'Used as the DEFAULT on every Module 7 company_id and inside every Module 7 RLS '
  'policy, so authenticated must hold EXECUTE — a caller-evaluated default and a '
  'policy expression both run as the CALLER.';

-- ---------------------------------------------------------------------
-- 1. ENUMS — their own, never reused from settlement.
-- ---------------------------------------------------------------------
CREATE TYPE public.invoice_status AS ENUM
  ('open', 'partial', 'paid', 'short_paid', 'written_off');

CREATE TYPE public.invoice_billing_path AS ENUM ('factored', 'direct');

-- ---------------------------------------------------------------------
-- 2. invoice_batches — the submission grouping, shaped like fuel_import_batches.
-- ---------------------------------------------------------------------
CREATE TABLE public.invoice_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id()
    REFERENCES public.carrier_profile(id) ON DELETE RESTRICT,
  batch_number text NOT NULL,
  billing_path public.invoice_billing_path NOT NULL,
  invoice_count integer NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  submitted_at timestamptz,
  submitted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT invoice_batches_number_check CHECK (btrim(batch_number) <> ''),
  CONSTRAINT invoice_batches_counts_check CHECK (invoice_count >= 0),
  CONSTRAINT invoice_batches_total_check CHECK (total_amount >= 0),
  CONSTRAINT invoice_batches_actor_requires_timestamp_check
    CHECK (submitted_by IS NULL OR submitted_at IS NOT NULL),
  CONSTRAINT invoice_batches_company_number_key UNIQUE (company_id, batch_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_batches TO authenticated;
GRANT ALL ON public.invoice_batches TO service_role;
ALTER TABLE public.invoice_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_batches management and owner only"
  ON public.invoice_batches FOR ALL TO authenticated
  USING (company_id = public.current_company_id()
     AND (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner')))
  WITH CHECK (company_id = public.current_company_id()
     AND (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner')));

-- ---------------------------------------------------------------------
-- 3. invoices — ONE ROW PER LOAD.
--
--    Rejected alternative, recorded so it is not revisited: per broker per
--    period. The schema is load-centric — load_charges.load_id is NOT NULL,
--    assert_charge_entry_allowed gates money by LOAD status, and the whole
--    billing chain lives on loads.status
--    (ready_to_invoice -> invoiced -> factored -> paid -> settled).
--    Factoring also buys loads individually.
-- ---------------------------------------------------------------------
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id()
    REFERENCES public.carrier_profile(id) ON DELETE RESTRICT,
  load_id uuid NOT NULL REFERENCES public.loads(id) ON DELETE RESTRICT,
  broker_id uuid REFERENCES public.brokers(id) ON DELETE RESTRICT,
  broker_name_snapshot text,
  broker_billing_email_snapshot text,
  invoice_number text NOT NULL,
  billing_path public.invoice_billing_path NOT NULL,
  batch_id uuid REFERENCES public.invoice_batches(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  status public.invoice_status NOT NULL DEFAULT 'open',
  submitted_at timestamptz,
  submitted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  purchased_at timestamptz,
  purchased_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  paid_at timestamptz,
  paid_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reconciled_at timestamptz,
  reconciled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  short_pay_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT invoices_load_key UNIQUE (load_id),
  CONSTRAINT invoices_company_number_key UNIQUE (company_id, invoice_number),
  CONSTRAINT invoices_number_check CHECK (btrim(invoice_number) <> ''),
  CONSTRAINT invoices_amount_nonnegative_check CHECK (amount >= 0),
  CONSTRAINT invoices_purchased_requires_factored_check
    CHECK (purchased_at IS NULL OR billing_path = 'factored'),
  CONSTRAINT invoices_lifecycle_order_check CHECK (
    (purchased_at  IS NULL OR (submitted_at IS NOT NULL AND purchased_at  >= submitted_at)) AND
    (paid_at       IS NULL OR (submitted_at IS NOT NULL AND paid_at       >= submitted_at)) AND
    (reconciled_at IS NULL OR (paid_at      IS NOT NULL AND reconciled_at >= paid_at))
  ),
  CONSTRAINT invoices_actor_requires_timestamp_check CHECK (
    (submitted_by  IS NULL OR submitted_at  IS NOT NULL) AND
    (purchased_by  IS NULL OR purchased_at  IS NOT NULL) AND
    (paid_by       IS NULL OR paid_at       IS NOT NULL) AND
    (reconciled_by IS NULL OR reconciled_at IS NOT NULL)
  ),
  CONSTRAINT invoices_short_pay_reason_check CHECK (
    status <> 'short_paid' OR btrim(coalesce(short_pay_reason, '')) <> ''
  )
);

CREATE INDEX invoices_broker_idx ON public.invoices (broker_id);
CREATE INDEX invoices_batch_idx ON public.invoices (batch_id);
CREATE INDEX invoices_status_idx ON public.invoices (company_id, status);

COMMENT ON CONSTRAINT invoices_load_key ON public.invoices IS
  'ONE INVOICE PER LOAD. A second invoice for the same load is refused by the '
  'database, not by a builder: the late-accessorial path is a Module 5 adjustment '
  'and a later SUPPLEMENTAL invoice, never a second primary invoice.';

COMMENT ON COLUMN public.invoices.billing_path IS
  'FROZEN AT BUILD TIME from brokers.factoring_status. A broker whose status is '
  'not_approved or unknown forces direct. Never re-read from the broker later: '
  'the path the invoice actually took is a historical fact.';

COMMENT ON COLUMN public.invoices.amount IS
  'The BROKER-FACING amount: header rate + unbundled FSC + ALL load charges. It is '
  'deliberately NOT the dispatch settlement base — the section 4.3 exclusion '
  'predicate asks whether there is carrier margin for a 5% to come out of, a '
  'question that does not exist on the broker side. The factor''s fee is NOT '
  'deducted here; the broker owes 100% of this. See payments.fee_amount.';

COMMENT ON COLUMN public.invoices.short_pay_reason IS
  'A short pay closes a balance only with a stated reason and a named actor. The '
  'invoice is never quietly written down to what arrived — that erases the dispute.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices management and owner only"
  ON public.invoices FOR ALL TO authenticated
  USING (company_id = public.current_company_id()
     AND (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner')))
  WITH CHECK (company_id = public.current_company_id()
     AND (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner')));

-- ---------------------------------------------------------------------
-- 4. invoice_line_items — the frozen parts. The total is the sum of the
--    lines, exactly as on both settlement systems.
-- ---------------------------------------------------------------------
CREATE TABLE public.invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id()
    REFERENCES public.carrier_profile(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  line_type text NOT NULL,
  description text,
  amount numeric(12,2) NOT NULL,
  load_charge_id uuid REFERENCES public.load_charges(id) ON DELETE SET NULL,
  charge_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT invoice_line_items_line_type_check
    CHECK (line_type IN ('linehaul', 'fsc', 'charge')),
  CONSTRAINT invoice_line_items_charge_reference_check CHECK (
    (line_type =  'charge' AND charge_type IS NOT NULL) OR
    (line_type <> 'charge' AND charge_type IS NULL AND load_charge_id IS NULL)
  )
);

CREATE INDEX invoice_line_items_invoice_idx ON public.invoice_line_items (invoice_id);

COMMENT ON COLUMN public.invoice_line_items.charge_type IS
  'SNAPSHOT of load_charges.charge_type as it stood when the invoice was built. '
  'load_charge_id is ON DELETE SET NULL, so the line survives its source and still '
  'says what was billed.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_line_items TO authenticated;
GRANT ALL ON public.invoice_line_items TO service_role;
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_line_items management and owner only"
  ON public.invoice_line_items FOR ALL TO authenticated
  USING (company_id = public.current_company_id()
     AND (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner')))
  WITH CHECK (company_id = public.current_company_id()
     AND (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner')));

-- ---------------------------------------------------------------------
-- 5. payments — many to one against an invoice.
--
--    THE TWO 2% FIGURES. There is ONE real-world fact — the factor charges
--    2% — computed in TWO places for two different purposes:
--      (a) dispatch_settlement_rates.factoring_pct reduces the dispatch
--          company's eligible base before the 5% fee (section 4.5);
--      (b) the factor's ACTUAL deduction from what lands in the bank, which
--          is recorded HERE.
--    These columns are ACTUAL FIGURES FROM THE REMITTANCE. What the factor
--    took is a fact to be recorded, never a percentage recomputed from a
--    rate table.
-- ---------------------------------------------------------------------
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id()
    REFERENCES public.carrier_profile(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  source text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  gross_amount numeric(12,2) NOT NULL,
  fee_amount numeric(12,2) NOT NULL DEFAULT 0,
  reserve_amount numeric(12,2) NOT NULL DEFAULT 0,
  net_deposited numeric(12,2) NOT NULL,
  reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT payments_source_check CHECK (source IN ('factor', 'broker', 'other')),
  CONSTRAINT payments_gross_positive_check CHECK (gross_amount > 0),
  CONSTRAINT payments_fee_nonnegative_check CHECK (fee_amount >= 0),
  CONSTRAINT payments_reserve_nonnegative_check CHECK (reserve_amount >= 0),
  CONSTRAINT payments_net_identity_check
    CHECK (net_deposited = gross_amount - fee_amount - reserve_amount)
);

CREATE INDEX payments_invoice_idx ON public.payments (invoice_id);

COMMENT ON COLUMN public.payments.fee_amount IS
  'What the factor ACTUALLY took, read off the remittance. NEVER recomputed from '
  'dispatch_settlement_rates.factoring_pct. Same real-world rate, two roles — see '
  'the comment on that column.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments management and owner only"
  ON public.payments FOR ALL TO authenticated
  USING (company_id = public.current_company_id()
     AND (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner')))
  WITH CHECK (company_id = public.current_company_id()
     AND (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner')));

-- ---------------------------------------------------------------------
-- 6. ar_aging_snapshots — daily, append only.
--    A snapshot because aging is a point-in-time fact that cannot be
--    reconstructed once the invoices are paid.
-- ---------------------------------------------------------------------
CREATE TABLE public.ar_aging_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id()
    REFERENCES public.carrier_profile(id) ON DELETE RESTRICT,
  snapshot_date date NOT NULL,
  broker_id uuid REFERENCES public.brokers(id) ON DELETE RESTRICT,
  bucket text NOT NULL,
  open_balance numeric(12,2) NOT NULL DEFAULT 0,
  invoice_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT ar_aging_snapshots_bucket_check
    CHECK (bucket IN ('0_30', '31_60', '61_90', '90_plus')),
  CONSTRAINT ar_aging_snapshots_count_check CHECK (invoice_count >= 0)
);

-- broker_id is nullable (a load with no broker), so the daily key coalesces it.
CREATE UNIQUE INDEX ar_aging_snapshots_daily_uniq ON public.ar_aging_snapshots
  (company_id, snapshot_date, coalesce(broker_id, '00000000-0000-0000-0000-000000000000'::uuid), bucket);

COMMENT ON TABLE public.ar_aging_snapshots IS
  'APPEND ONLY. Aging is a point-in-time fact: once an invoice is paid, what 61-90 '
  'looked like in March can no longer be reconstructed from live data.';

GRANT SELECT, INSERT ON public.ar_aging_snapshots TO authenticated;
GRANT ALL ON public.ar_aging_snapshots TO service_role;
ALTER TABLE public.ar_aging_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ar_aging_snapshots management and owner only"
  ON public.ar_aging_snapshots FOR ALL TO authenticated
  USING (company_id = public.current_company_id()
     AND (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner')))
  WITH CHECK (company_id = public.current_company_id()
     AND (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner')));

-- ---------------------------------------------------------------------
-- 7. IMMUTABILITY — its own writer gate, deliberately.
--    Mirrors the APPROACH of enforce_dispatch_settlement_immutability but
--    shares nothing with it: app.invoice_write cannot unlock a settlement
--    and app.settlement_write / app.dispatch_settlement_write cannot unlock
--    an invoice.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invoice_writer_active()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$ SELECT coalesce(current_setting('app.invoice_write', true), 'off') = 'on' $$;

REVOKE ALL ON FUNCTION public.invoice_writer_active() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invoice_writer_active() FROM anon;
REVOKE ALL ON FUNCTION public.invoice_writer_active() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.invoice_writer_active() TO service_role;

-- An invoice is immutable once SUBMITTED: it has gone to a broker or a
-- factor and is a document someone else now holds.
--
-- WHAT IS FROZEN: the invoice's identity and money — company, load, broker,
-- number, billing path, amount, batch, and the submission itself.
-- WHAT IS NOT: status, the payment-lifecycle timestamps and their actors,
-- the short-pay reason, and notes. Payments against a submitted invoice are
-- the POINT of an invoice; freezing them would freeze the receivable.
CREATE OR REPLACE FUNCTION public.enforce_invoice_immutability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.submitted_at IS NOT NULL AND NOT public.invoice_writer_active() THEN
      RAISE EXCEPTION 'Invoice % has been SUBMITTED and cannot be deleted.', OLD.invoice_number
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.submitted_at IS NOT NULL AND NOT public.invoice_writer_active() THEN
    IF NEW.company_id     IS DISTINCT FROM OLD.company_id
    OR NEW.load_id        IS DISTINCT FROM OLD.load_id
    OR NEW.broker_id      IS DISTINCT FROM OLD.broker_id
    OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
    OR NEW.billing_path   IS DISTINCT FROM OLD.billing_path
    OR NEW.amount         IS DISTINCT FROM OLD.amount
    OR NEW.batch_id       IS DISTINCT FROM OLD.batch_id
    OR NEW.submitted_at   IS DISTINCT FROM OLD.submitted_at
    OR NEW.submitted_by   IS DISTINCT FROM OLD.submitted_by
    OR NEW.broker_name_snapshot           IS DISTINCT FROM OLD.broker_name_snapshot
    OR NEW.broker_billing_email_snapshot  IS DISTINCT FROM OLD.broker_billing_email_snapshot
    THEN
      RAISE EXCEPTION 'Invoice % has been SUBMITTED; its load, broker, number, path and amount are immutable. Payments and status may still move.', OLD.invoice_number
        USING ERRCODE = '42501';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_invoice_immutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_invoice_immutability() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_invoice_immutability() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_invoice_immutability() TO service_role;

CREATE TRIGGER enforce_invoice_immutability
  BEFORE UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invoice_immutability();

-- The lines are the invoice. A submitted invoice's lines cannot be added
-- to, edited or removed.
CREATE OR REPLACE FUNCTION public.enforce_invoice_line_immutability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_invoice uuid;
  v_submitted timestamptz;
  v_number text;
BEGIN
  v_invoice := CASE WHEN TG_OP = 'DELETE' THEN OLD.invoice_id ELSE NEW.invoice_id END;
  SELECT i.submitted_at, i.invoice_number INTO v_submitted, v_number
    FROM public.invoices i WHERE i.id = v_invoice;

  IF v_submitted IS NOT NULL AND NOT public.invoice_writer_active() THEN
    RAISE EXCEPTION 'Invoice % has been SUBMITTED; its line items are immutable.', v_number
      USING ERRCODE = '42501';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_invoice_line_immutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_invoice_line_immutability() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_invoice_line_immutability() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_invoice_line_immutability() TO service_role;

CREATE TRIGGER enforce_invoice_line_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_line_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invoice_line_immutability();

-- Append only. A snapshot that can be edited is not a snapshot.
CREATE OR REPLACE FUNCTION public.enforce_ar_aging_snapshot_append_only()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RAISE EXCEPTION 'ar_aging_snapshots is append only; a snapshot is a point-in-time fact.'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_ar_aging_snapshot_append_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_ar_aging_snapshot_append_only() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_ar_aging_snapshot_append_only() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_ar_aging_snapshot_append_only() TO service_role;

CREATE TRIGGER enforce_ar_aging_snapshot_append_only
  BEFORE UPDATE OR DELETE ON public.ar_aging_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.enforce_ar_aging_snapshot_append_only();

-- ---------------------------------------------------------------------
-- 8. ACTOR STAMPING — resolved server side, never sent by the browser.
--    Mirrors stamp_dispatch_settlement_actors.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stamp_invoice_actors()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  actor uuid;
BEGIN
  actor := public.current_profile_id();

  -- Client-supplied actor values are never trusted: carry the stored value
  -- forward, then overwrite only on the transition that earns the stamp.
  NEW.submitted_by := OLD.submitted_by;
  NEW.purchased_by := OLD.purchased_by;
  NEW.paid_by := OLD.paid_by;
  NEW.reconciled_by := OLD.reconciled_by;

  IF NEW.submitted_at IS NOT NULL AND OLD.submitted_at IS NULL THEN
    NEW.submitted_by := actor;
  END IF;
  IF NEW.purchased_at IS NOT NULL AND OLD.purchased_at IS NULL THEN
    NEW.purchased_by := actor;
  END IF;
  IF NEW.paid_at IS NOT NULL AND OLD.paid_at IS NULL THEN
    NEW.paid_by := actor;
  END IF;
  IF NEW.reconciled_at IS NOT NULL AND OLD.reconciled_at IS NULL THEN
    NEW.reconciled_by := actor;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_invoice_actors() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stamp_invoice_actors() FROM anon;
REVOKE ALL ON FUNCTION public.stamp_invoice_actors() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.stamp_invoice_actors() TO service_role;

-- Named to sort AFTER enforce_invoice_immutability so the frozen-column
-- comparison sees the row as the caller sent it.
CREATE TRIGGER stamp_invoice_actors
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.stamp_invoice_actors();

-- ---------------------------------------------------------------------
-- 9. THE COUPLING, RECORDED WHERE THE OTHER HALF LIVES.
-- ---------------------------------------------------------------------
COMMENT ON COLUMN public.dispatch_settlement_rates.factoring_pct IS
  'THE SAME REAL-WORLD RATE AS payments.fee_amount, SERVING A DIFFERENT ROLE. '
  'One fact — the factor charges 2% — computed in two places: here it reduces the '
  'dispatch company''s eligible base before the 5% dispatch fee (section 4.5); on '
  'payments.fee_amount it is the actual deduction from what landed in the bank, '
  'read off the remittance and never recomputed from this column. '
  'COUPLING: if the factor renegotiates, TWO things must change — a new row here, '
  'and the actual fees recorded on new payments. Nothing in the schema connects '
  'them and nothing will notice if only one is updated.';