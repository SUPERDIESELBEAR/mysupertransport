-- =====================================================================
-- Module 4 — dispatch company settlement, Pass 1: SCHEMA ONLY.
-- No computation function, no line-item writer, no UI.
-- =====================================================================

CREATE TYPE public.dispatch_settlement_status AS ENUM ('draft', 'approved', 'paid', 'void');

-- ---------------------------------------------------------------- 2.5 rates
CREATE TABLE public.dispatch_settlement_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_pct numeric NOT NULL CHECK (dispatch_pct >= 0 AND dispatch_pct <= 100),
  factoring_pct numeric NOT NULL CHECK (factoring_pct >= 0 AND factoring_pct <= 100),
  effective_from date NOT NULL,
  effective_to date,
  CONSTRAINT dispatch_settlement_rates_window_check
    CHECK (effective_to IS NULL OR effective_to > effective_from),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatch_settlement_rates TO authenticated;
GRANT ALL ON public.dispatch_settlement_rates TO service_role;
ALTER TABLE public.dispatch_settlement_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Management manages dispatch settlement rates"
  ON public.dispatch_settlement_rates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE TABLE public.dispatch_settlement_rates_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field text NOT NULL,
  previous_value text,
  new_value text,
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.dispatch_settlement_rates_history TO authenticated;
GRANT ALL ON public.dispatch_settlement_rates_history TO service_role;
ALTER TABLE public.dispatch_settlement_rates_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Management reads dispatch rate history"
  ON public.dispatch_settlement_rates_history FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Management writes dispatch rate history"
  ON public.dispatch_settlement_rates_history FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

-- ------------------------------------------------------------ 2.4 deductions
CREATE TABLE public.dispatch_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  is_active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL,
  effective_to date,
  CONSTRAINT dispatch_deductions_window_check
    CHECK (effective_to IS NULL OR effective_to > effective_from),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatch_deductions TO authenticated;
GRANT ALL ON public.dispatch_deductions TO service_role;
ALTER TABLE public.dispatch_deductions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Management manages dispatch deductions"
  ON public.dispatch_deductions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

-- ----------------------------------------------------------- 2.1 settlements
CREATE TABLE public.dispatch_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month date NOT NULL,
  CONSTRAINT dispatch_settlements_period_month_first_check
    CHECK (EXTRACT(day FROM period_month) = 1),
  payee_key text NOT NULL DEFAULT 'dispatch_company',
  CONSTRAINT dispatch_settlements_payee_key_check CHECK (payee_key = 'dispatch_company'),
  status public.dispatch_settlement_status NOT NULL DEFAULT 'draft',
  factoring_pct numeric NOT NULL,
  dispatch_pct numeric NOT NULL,
  eligible_base numeric NOT NULL DEFAULT 0,
  factoring_reduction numeric NOT NULL DEFAULT 0,
  reduced_base numeric NOT NULL DEFAULT 0,
  dispatch_fee numeric NOT NULL DEFAULT 0,
  deductions_amount numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  computed_at timestamptz,
  approved_at timestamptz,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  paid_at timestamptz,
  void_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT dispatch_settlements_payee_period_key UNIQUE (payee_key, period_month),
  CONSTRAINT dispatch_settlements_void_reason_check
    CHECK (status <> 'void' OR void_reason IS NOT NULL)
);
COMMENT ON COLUMN public.dispatch_settlements.factoring_pct IS
  'The factoring rate AS APPLIED, copied onto the row when the month is computed so a later rate change cannot retroactively alter a settled month.';
COMMENT ON COLUMN public.dispatch_settlements.dispatch_pct IS
  'The dispatch fee rate AS APPLIED, copied onto the row when the month is computed so a later rate change cannot retroactively alter a settled month.';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatch_settlements TO authenticated;
GRANT ALL ON public.dispatch_settlements TO service_role;
ALTER TABLE public.dispatch_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Management manages dispatch settlements"
  ON public.dispatch_settlements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

-- ------------------------------------------------------------ 2.2 line items
CREATE TABLE public.dispatch_settlement_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_settlement_id uuid NOT NULL
    REFERENCES public.dispatch_settlements(id) ON DELETE CASCADE,
  line_type text NOT NULL,
  CONSTRAINT dispatch_settlement_line_items_line_type_check CHECK (line_type IN
    ('load_base', 'factoring_reduction', 'dispatch_fee', 'flat_deduction', 'one_off')),
  amount numeric NOT NULL,
  description text NOT NULL,
  load_id uuid REFERENCES public.loads(id) ON DELETE RESTRICT,
  dispatcher_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  deduction_id uuid REFERENCES public.dispatch_deductions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT dispatch_settlement_line_items_one_off_load_check
    CHECK (line_type <> 'one_off' OR load_id IS NOT NULL),
  CONSTRAINT dispatch_settlement_line_items_load_base_load_check
    CHECK (line_type <> 'load_base' OR load_id IS NOT NULL)
);
COMMENT ON CONSTRAINT dispatch_settlement_line_items_load_id_fkey
  ON public.dispatch_settlement_line_items IS
  'ON DELETE RESTRICT is deliberate: a load that has been settled against must not be deletable. The cutover purge works by VOIDING settlements first, which cascades their lines and releases the loads.';
COMMENT ON COLUMN public.dispatch_settlement_line_items.dispatcher_id IS
  'FROZEN ATTRIBUTION. A copy taken when the month is computed. A later correction via set_load_dispatcher does NOT move a settled month''s breakdown: a settlement is a payment record, not a live report, and once the dispatch company has been paid against a breakdown that breakdown is what was agreed and must still read the same a year later. Accepted consequence: an attribution error becomes permanent once a month is settled. Tolerable because attribution is visibility only (section 4.6) — no money depends on it.';
CREATE UNIQUE INDEX dispatch_settlement_line_items_load_base_uniq
  ON public.dispatch_settlement_line_items (dispatch_settlement_id, load_id)
  WHERE line_type = 'load_base';
CREATE INDEX dispatch_settlement_line_items_settlement_idx
  ON public.dispatch_settlement_line_items (dispatch_settlement_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatch_settlement_line_items TO authenticated;
GRANT ALL ON public.dispatch_settlement_line_items TO service_role;
ALTER TABLE public.dispatch_settlement_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Management manages dispatch settlement line items"
  ON public.dispatch_settlement_line_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

-- --------------------------------------------------------- 2.3 contributions
CREATE TABLE public.dispatch_settlement_load_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_settlement_id uuid NOT NULL
    REFERENCES public.dispatch_settlements(id) ON DELETE CASCADE,
  load_id uuid NOT NULL REFERENCES public.loads(id) ON DELETE RESTRICT,
  load_number text NOT NULL,
  load_type text NOT NULL,
  rate_type text NOT NULL,
  delivered_at timestamptz,
  carrier_delivery_date date,
  header_component numeric NOT NULL DEFAULT 0,
  fsc_component numeric NOT NULL DEFAULT 0,
  charges_included_amount numeric NOT NULL DEFAULT 0,
  charges_excluded_amount numeric NOT NULL DEFAULT 0,
  base_total numeric NOT NULL DEFAULT 0,
  pay_policy_id uuid REFERENCES public.pay_policies(id) ON DELETE SET NULL,
  dispatcher_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT dispatch_settlement_contributions_load_uniq
    UNIQUE (dispatch_settlement_id, load_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatch_settlement_load_contributions TO authenticated;
GRANT ALL ON public.dispatch_settlement_load_contributions TO service_role;
ALTER TABLE public.dispatch_settlement_load_contributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Management manages dispatch settlement contributions"
  ON public.dispatch_settlement_load_contributions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

-- Per-charge verdict. The exclusion reason is a CONSTRAINED COLUMN, never text
-- to be parsed: section 4.3 is the part most likely to be wrong and this is how
-- a wrong answer is diagnosed.
CREATE TABLE public.dispatch_settlement_charge_verdicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contribution_id uuid NOT NULL
    REFERENCES public.dispatch_settlement_load_contributions(id) ON DELETE CASCADE,
  load_charge_id uuid REFERENCES public.load_charges(id) ON DELETE SET NULL,
  charge_type text NOT NULL,
  classification text NOT NULL,
  amount numeric NOT NULL,
  excluded boolean NOT NULL,
  exclusion_reason text,
  CONSTRAINT dispatch_charge_verdicts_reason_check
    CHECK (exclusion_reason IS NULL OR exclusion_reason IN ('pct_100', 'reimbursement_class')),
  CONSTRAINT dispatch_charge_verdicts_reason_presence_check
    CHECK (excluded = (exclusion_reason IS NOT NULL)),
  resolved_pct numeric,
  pct_column text,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.dispatch_settlement_charge_verdicts.pct_column IS
  'The pay_policies *_pct column actually read for this charge. Recorded so a wrong exclusion can be traced to the mapping rather than guessed at. Never charge_pay_classes (section 4.3).';
CREATE INDEX dispatch_charge_verdicts_contribution_idx
  ON public.dispatch_settlement_charge_verdicts (contribution_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatch_settlement_charge_verdicts TO authenticated;
GRANT ALL ON public.dispatch_settlement_charge_verdicts TO service_role;
ALTER TABLE public.dispatch_settlement_charge_verdicts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Management manages dispatch charge verdicts"
  ON public.dispatch_settlement_charge_verdicts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

-- ================================================================ IMMUTABILITY
CREATE OR REPLACE FUNCTION public.dispatch_settlement_writer_active()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$ SELECT coalesce(current_setting('app.dispatch_settlement_write', true), 'off') = 'on' $$;
REVOKE ALL ON FUNCTION public.dispatch_settlement_writer_active() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dispatch_settlement_writer_active() FROM anon;
REVOKE EXECUTE ON FUNCTION public.dispatch_settlement_writer_active() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_settlement_writer_active() TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_dispatch_settlement_immutability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'paid' AND NOT public.dispatch_settlement_writer_active() THEN
      RAISE EXCEPTION 'Dispatch settlement % is PAID and cannot be deleted.', OLD.id
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'paid' AND NOT public.dispatch_settlement_writer_active() THEN
    RAISE EXCEPTION 'Dispatch settlement % is PAID and is immutable.', OLD.id
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'void' AND OLD.status <> 'void' THEN
    IF OLD.status = 'paid' THEN
      RAISE EXCEPTION 'Dispatch settlement % is PAID and cannot be voided.', OLD.id
        USING ERRCODE = '42501';
    END IF;
    IF NEW.void_reason IS NULL OR btrim(NEW.void_reason) = '' THEN
      RAISE EXCEPTION 'Voiding a dispatch settlement requires a reason.'
        USING ERRCODE = '22023';
    END IF;
    NEW.eligible_base := 0;
    NEW.factoring_reduction := 0;
    NEW.reduced_base := 0;
    NEW.dispatch_fee := 0;
    NEW.deductions_amount := 0;
    NEW.net_amount := 0;
    NEW.computed_at := NULL;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.enforce_dispatch_settlement_immutability() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_dispatch_settlement_immutability() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_dispatch_settlement_immutability() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_dispatch_settlement_immutability() TO service_role;

-- The void erases the breakdown so the month can be computed fresh. AFTER, so
-- the row's own transition has already been validated.
CREATE OR REPLACE FUNCTION public.apply_dispatch_settlement_void()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $function$
BEGIN
  IF NEW.status = 'void' AND OLD.status <> 'void' THEN
    DELETE FROM public.dispatch_settlement_line_items WHERE dispatch_settlement_id = NEW.id;
    DELETE FROM public.dispatch_settlement_load_contributions WHERE dispatch_settlement_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.apply_dispatch_settlement_void() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_dispatch_settlement_void() FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_dispatch_settlement_void() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_dispatch_settlement_void() TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_dispatch_settlement_child_immutability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_settlement uuid;
  v_status public.dispatch_settlement_status;
BEGIN
  v_settlement := CASE WHEN TG_OP = 'DELETE' THEN OLD.dispatch_settlement_id
                       ELSE NEW.dispatch_settlement_id END;
  SELECT s.status INTO v_status FROM public.dispatch_settlements s WHERE s.id = v_settlement;

  IF v_status = 'paid' AND NOT public.dispatch_settlement_writer_active() THEN
    RAISE EXCEPTION 'Dispatch settlement % is PAID; its breakdown is immutable.', v_settlement
      USING ERRCODE = '42501';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;
REVOKE ALL ON FUNCTION public.enforce_dispatch_settlement_child_immutability() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_dispatch_settlement_child_immutability() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_dispatch_settlement_child_immutability() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_dispatch_settlement_child_immutability() TO service_role;

CREATE TRIGGER enforce_dispatch_settlement_immutability
  BEFORE UPDATE OR DELETE ON public.dispatch_settlements
  FOR EACH ROW EXECUTE FUNCTION public.enforce_dispatch_settlement_immutability();

CREATE TRIGGER apply_dispatch_settlement_void
  AFTER UPDATE ON public.dispatch_settlements
  FOR EACH ROW EXECUTE FUNCTION public.apply_dispatch_settlement_void();

CREATE TRIGGER enforce_dispatch_settlement_line_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON public.dispatch_settlement_line_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_dispatch_settlement_child_immutability();

CREATE TRIGGER enforce_dispatch_settlement_contribution_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON public.dispatch_settlement_load_contributions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_dispatch_settlement_child_immutability();

CREATE TRIGGER update_dispatch_settlement_rates_updated_at
  BEFORE UPDATE ON public.dispatch_settlement_rates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_dispatch_deductions_updated_at
  BEFORE UPDATE ON public.dispatch_deductions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ======================================================================= SEED
INSERT INTO public.dispatch_settlement_rates (dispatch_pct, factoring_pct, effective_from)
VALUES (5.00, 2.00, DATE '2026-01-01');
