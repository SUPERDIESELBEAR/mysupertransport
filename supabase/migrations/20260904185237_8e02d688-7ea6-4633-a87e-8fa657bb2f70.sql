-- =====================================================================
-- Module 5, Pass 4 / Pass 1 — the accessorial adjustment record (-A1).
-- Schema, constraints, RLS, grants and the source_table CHECK extension.
-- NO writer, NO allocator, NO approval RPC, NO settlement seam, NO UI.
-- =====================================================================

CREATE TABLE public.accessorial_adjustments (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               uuid NOT NULL REFERENCES public.carrier_profile(id) ON DELETE RESTRICT,
  load_id                  uuid NOT NULL REFERENCES public.loads(id) ON DELETE RESTRICT,
  reference                text NOT NULL,
  sequence                 integer NOT NULL,
  charge_type              text NOT NULL,
  description              text,
  amount                   numeric NOT NULL,
  funding_source           text,
  actual_cost              numeric,
  proof_document_id        uuid REFERENCES public.load_documents(id) ON DELETE SET NULL,
  status                   text NOT NULL DEFAULT 'draft',
  reason                   text NOT NULL,
  void_reason              text,
  approved_at              timestamptz,
  approved_by              uuid REFERENCES public.profiles(id),
  settlement_id            uuid REFERENCES public.settlements(id) ON DELETE RESTRICT,
  settlement_line_item_id  uuid REFERENCES public.settlement_line_items(id) ON DELETE SET NULL,
  invoice_id               uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  billing_state            text NOT NULL DEFAULT 'not_required',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid REFERENCES public.profiles(id),
  updated_by               uuid REFERENCES public.profiles(id),

  CONSTRAINT accessorial_adjustments_load_sequence_key UNIQUE (load_id, sequence),
  CONSTRAINT accessorial_adjustments_company_reference_key UNIQUE (company_id, reference),

  CONSTRAINT accessorial_adjustments_sequence_check
    CHECK (sequence >= 1),
  CONSTRAINT accessorial_adjustments_reference_format_check
    CHECK (reference ~ '^[A-Za-z0-9._/-]+-A[0-9]+$'),
  -- Mirrors public.assert_known_charge_type, which is what gates
  -- load_charges.charge_type. The pay policy prices these nine and no others;
  -- a tenth value here would be an adjustment the engine cannot price.
  CONSTRAINT accessorial_adjustments_charge_type_check
    CHECK (charge_type = ANY (ARRAY[
      'linehaul','fsc','detention','stopoff','lumper',
      'layover','tonu','reimbursement','other'])),
  CONSTRAINT accessorial_adjustments_amount_check
    CHECK (amount <> 0),
  CONSTRAINT accessorial_adjustments_funding_source_check
    CHECK (funding_source IS NULL OR funding_source = ANY (ARRAY['driver','company'])),
  CONSTRAINT accessorial_adjustments_actual_cost_check
    CHECK (actual_cost IS NULL OR actual_cost >= 0),
  CONSTRAINT accessorial_adjustments_reason_present_check
    CHECK (btrim(reason) <> ''),
  CONSTRAINT accessorial_adjustments_status_check
    CHECK (status = ANY (ARRAY['draft','pending_approval','approved','settled','rejected','void'])),
  CONSTRAINT accessorial_adjustments_billing_state_check
    CHECK (billing_state = ANY (ARRAY['not_required','pending_supplemental','billed'])),

  -- An approval is a moment AND an actor, or it is neither.
  CONSTRAINT accessorial_adjustments_approval_pair_check
    CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
  -- Approved and settled rows must carry the approval that earned them.
  CONSTRAINT accessorial_adjustments_approved_requires_approval_check
    CHECK (status NOT IN ('approved','settled') OR approved_at IS NOT NULL),
  -- A void row states why. (Voiding is how a wrong approved row is corrected.)
  CONSTRAINT accessorial_adjustments_void_reason_check
    CHECK (status <> 'void' OR btrim(coalesce(void_reason, '')) <> ''),
  -- Consumption and status agree in both directions: settled iff a settlement.
  CONSTRAINT accessorial_adjustments_settled_pair_check
    CHECK ((status = 'settled') = (settlement_id IS NOT NULL)),
  -- A settlement line pointer is meaningless without its settlement.
  CONSTRAINT accessorial_adjustments_line_requires_settlement_check
    CHECK (settlement_line_item_id IS NULL OR settlement_id IS NOT NULL),
  -- Billed iff an invoice carries it.
  CONSTRAINT accessorial_adjustments_billed_pair_check
    CHECK ((billing_state = 'billed') = (invoice_id IS NOT NULL))
);

COMMENT ON TABLE public.accessorial_adjustments IS
  'A late accessorial (-A1) on a load whose money is already fixed. Separate '
  'from load_charges deliberately: an unapproved adjustment must be invisible '
  'to the four readers of money by construction, not by filter. See '
  'docs/tms-build-status.md, "Module 5, Pass 4".';

COMMENT ON COLUMN public.accessorial_adjustments.company_id IS
  'Stamped server-side by the aa_stamp_company_id trigger. NEVER accepted from '
  'the client and never a column DEFAULT (a DEFAULT is evaluated as the caller).';
COMMENT ON COLUMN public.accessorial_adjustments.sequence IS
  'Per load, not global. Allocated inside the Pass 2 writer as a consequence of '
  'a successful insert, protected by accessorial_adjustments_load_sequence_key. '
  'Explicitly NOT the generate_load_number pattern, which increments on form '
  'open and has burned 52 of 63 load numbers.';

CREATE INDEX accessorial_adjustments_load_idx ON public.accessorial_adjustments (load_id);
CREATE INDEX accessorial_adjustments_pending_idx
  ON public.accessorial_adjustments (status, approved_at)
  WHERE settlement_id IS NULL;

-- ---------------------------------------------------------------------
-- Tenancy: stamped, never asserted. Reuses the Module 7 Pass 1 stamper,
-- whose whole body is `NEW.company_id := public.current_company_id();`.
-- ---------------------------------------------------------------------
CREATE TRIGGER aa_stamp_company_id
  BEFORE INSERT ON public.accessorial_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.stamp_billing_company_id();

-- ---------------------------------------------------------------------
-- Actors, server-resolved.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stamp_accessorial_adjustment_actor()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(public.current_profile_id(), NEW.created_by);
    NEW.updated_by := NEW.created_by;
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.updated_by := COALESCE(public.current_profile_id(), OLD.updated_by);
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.stamp_accessorial_adjustment_actor() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.stamp_accessorial_adjustment_actor() FROM anon;
REVOKE EXECUTE ON FUNCTION public.stamp_accessorial_adjustment_actor() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.stamp_accessorial_adjustment_actor() TO service_role;

CREATE TRIGGER stamp_accessorial_adjustment_actor
  BEFORE INSERT OR UPDATE ON public.accessorial_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.stamp_accessorial_adjustment_actor();

-- ---------------------------------------------------------------------
-- Its OWN writer gate. app.settlement_write, app.dispatch_settlement_write
-- and app.invoice_write must not unlock an adjustment, and this one must not
-- unlock them: one privileged correction path should never open two sets of
-- books.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accessorial_adjustment_writer_active()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT coalesce(current_setting('app.accessorial_adjustment_write', true), 'off') = 'on';
$$;
REVOKE EXECUTE ON FUNCTION public.accessorial_adjustment_writer_active() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accessorial_adjustment_writer_active() FROM anon;
REVOKE EXECUTE ON FUNCTION public.accessorial_adjustment_writer_active() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.accessorial_adjustment_writer_active() TO service_role;

-- ---------------------------------------------------------------------
-- Immutability. FROZEN once approved: the money and its identity.
-- NOT FROZEN, deliberately: status, settlement_id, settlement_line_item_id,
-- invoice_id, billing_state, void_reason — an adjustment that cannot record
-- its own consumption could never be paid or billed.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_accessorial_adjustment_immutability()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('approved','settled')
       AND NOT public.accessorial_adjustment_writer_active() THEN
      RAISE EXCEPTION 'Adjustment % is %; it is voided with a reason, never deleted.',
        OLD.reference, OLD.status USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status IN ('approved','settled')
     AND NOT public.accessorial_adjustment_writer_active() THEN
    IF NEW.company_id     IS DISTINCT FROM OLD.company_id
    OR NEW.load_id        IS DISTINCT FROM OLD.load_id
    OR NEW.reference      IS DISTINCT FROM OLD.reference
    OR NEW.sequence       IS DISTINCT FROM OLD.sequence
    OR NEW.charge_type    IS DISTINCT FROM OLD.charge_type
    OR NEW.amount         IS DISTINCT FROM OLD.amount
    OR NEW.funding_source IS DISTINCT FROM OLD.funding_source
    OR NEW.actual_cost    IS DISTINCT FROM OLD.actual_cost
    OR NEW.reason         IS DISTINCT FROM OLD.reason
    OR NEW.approved_at    IS DISTINCT FROM OLD.approved_at
    OR NEW.approved_by    IS DISTINCT FROM OLD.approved_by
    THEN
      RAISE EXCEPTION 'Adjustment % is APPROVED; its load, reference, classification and amount are immutable. Void it with a reason and re-enter. Status, settlement and invoice pointers may still advance.',
        OLD.reference USING ERRCODE = '42501';
    END IF;

    -- Status may only ADVANCE out of approved. Terminal stays terminal.
    IF OLD.status = 'approved'
       AND NEW.status NOT IN ('approved','settled','void') THEN
      RAISE EXCEPTION 'Adjustment % cannot return to % once approved.',
        OLD.reference, NEW.status USING ERRCODE = '42501';
    END IF;
    IF OLD.status = 'settled' AND NEW.status <> 'settled' THEN
      RAISE EXCEPTION 'Adjustment % has been settled; its status is final.',
        OLD.reference USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.enforce_accessorial_adjustment_immutability() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_accessorial_adjustment_immutability() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_accessorial_adjustment_immutability() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_accessorial_adjustment_immutability() TO service_role;

CREATE TRIGGER enforce_accessorial_adjustment_immutability
  BEFORE UPDATE OR DELETE ON public.accessorial_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_accessorial_adjustment_immutability();

-- ---------------------------------------------------------------------
-- Access. Read for the same three roles assert_charge_entry_allowed admits —
-- a dispatcher chasing a late detention has to see it. No operator predicate
-- exists to get wrong, because there is no operator access at all.
-- Writes arrive in Pass 2 as a SECURITY DEFINER RPC, so no write policy.
-- ---------------------------------------------------------------------
GRANT SELECT ON public.accessorial_adjustments TO authenticated;
GRANT ALL ON public.accessorial_adjustments TO service_role;

ALTER TABLE public.accessorial_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dispatcher management owner read within company"
  ON public.accessorial_adjustments
  FOR SELECT TO authenticated
  USING (
    company_id = public.current_company_id()
    AND (
      public.has_role(auth.uid(), 'dispatcher'::app_role)
      OR public.has_role(auth.uid(), 'management'::app_role)
      OR public.has_role(auth.uid(), 'owner'::app_role)
    )
  );

-- =====================================================================
-- The source_table CHECK extension — deliberate, not incidental.
-- =====================================================================
ALTER TABLE public.settlement_line_items
  DROP CONSTRAINT settlement_line_items_source_table_check;

ALTER TABLE public.settlement_line_items
  ADD CONSTRAINT settlement_line_items_source_table_check
  CHECK (source_table = ANY (ARRAY[
    'loads','fuel_transactions','deductions','deduction_installments',
    'cash_advances','rm_deposits','settlements','accessorial_adjustments']));

COMMENT ON CONSTRAINT settlement_line_items_source_table_check
  ON public.settlement_line_items IS
  'source_table is what the double-pay guard keys on, so every value admitted '
  'here gives every future reader a case to handle. accessorial_adjustments '
  'was added deliberately in Module 5 Pass 4 / Pass 1. An adjustment is a '
  'SETTLE-ONCE item: it is excluded by settledSourcesEver, NOT by the '
  'period-scoped set, which exists for recurring deductions. The two recorded '
  'settlement defects pull in opposite directions and getting this backwards '
  'reproduces one of them — see docs/tms-build-status.md, "Module 5, Pass 4", '
  'rather than reasoning about it afresh.';