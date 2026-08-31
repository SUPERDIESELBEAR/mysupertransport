-- ============================================================
-- MODULE 4 PASS 1 — SETTLEMENT FOUNDATION
-- Part A: the departing flag (counterpart to parked; NOT lease_terminations)
-- ============================================================

ALTER TABLE public.operators
  ADD COLUMN is_departing boolean NOT NULL DEFAULT false,
  ADD COLUMN departing_note text,
  ADD COLUMN departing_expected_date date,
  ADD COLUMN departing_at timestamptz,
  ADD COLUMN departing_by uuid;

COMMENT ON COLUMN public.operators.is_departing IS
  'Driver may be leaving. Keeps the driver active, dispatchable and settling; changes settlement BEHAVIOUR only. Never shown to the driver. Not a lease termination. Actor integrity lives on operator_departing_events.changed_by (no FK here, deliberately, so operators->profiles stays a non-embeddable relation).';

CREATE TABLE public.operator_departing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('flagged','cleared')),
  note text,
  expected_date date,
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_operator_departing_events_operator ON public.operator_departing_events(operator_id);
CREATE INDEX idx_operator_departing_events_changed_at ON public.operator_departing_events(changed_at DESC);

GRANT SELECT ON public.operator_departing_events TO authenticated;
GRANT ALL ON public.operator_departing_events TO service_role;
ALTER TABLE public.operator_departing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dispatch and management can view departing events"
ON public.operator_departing_events FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'dispatcher')
  OR public.has_role(auth.uid(), 'management')
  OR public.has_role(auth.uid(), 'owner')
);

CREATE OR REPLACE FUNCTION public.set_operator_departing(
  _operator_id uuid,
  _note text DEFAULT NULL,
  _expected_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
DECLARE
  _actor uuid;
  _event_id uuid;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'dispatcher')
    OR public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
  ) THEN
    RAISE EXCEPTION 'Not authorised to flag drivers as departing' USING ERRCODE = '42501';
  END IF;

  _actor := public.current_profile_id();

  UPDATE public.operators
     SET is_departing = true,
         departing_note = NULLIF(btrim(coalesce(_note,'')), ''),
         departing_expected_date = _expected_date,
         departing_at = now(),
         departing_by = _actor
   WHERE id = _operator_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operator not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.operator_departing_events (operator_id, action, note, expected_date, changed_by)
  VALUES (_operator_id, 'flagged', NULLIF(btrim(coalesce(_note,'')), ''), _expected_date, _actor)
  RETURNING id INTO _event_id;

  RETURN _event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_operator_departing(uuid, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_operator_departing(uuid, text, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_operator_departing(uuid, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_operator_departing(uuid, text, date) TO service_role;

CREATE OR REPLACE FUNCTION public.clear_operator_departing(
  _operator_id uuid,
  _note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
DECLARE
  _actor uuid;
  _event_id uuid;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'dispatcher')
    OR public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
  ) THEN
    RAISE EXCEPTION 'Not authorised to clear the departing flag' USING ERRCODE = '42501';
  END IF;

  _actor := public.current_profile_id();

  UPDATE public.operators
     SET is_departing = false,
         departing_note = NULL,
         departing_expected_date = NULL,
         departing_at = NULL,
         departing_by = NULL
   WHERE id = _operator_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operator not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.operator_departing_events (operator_id, action, note, changed_by)
  VALUES (_operator_id, 'cleared', NULLIF(btrim(coalesce(_note,'')), ''), _actor)
  RETURNING id INTO _event_id;

  RETURN _event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_operator_departing(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_operator_departing(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.clear_operator_departing(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_operator_departing(uuid, text) TO service_role;

-- ============================================================
-- Part C: configuration (nothing hardcoded)
-- ============================================================

CREATE TABLE public.settlement_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  minimum_net_pay_threshold numeric(12,2) NOT NULL DEFAULT 100,
  hold_buffer numeric(12,2) NOT NULL DEFAULT 500,
  equipment_value_per_driver numeric(12,2) NOT NULL DEFAULT 1200,
  rm_deposit_target numeric(12,2) NOT NULL DEFAULT 2000,
  rm_weekly_deduction numeric(12,2) NOT NULL DEFAULT 200,
  work_week_start_dow smallint NOT NULL DEFAULT 3 CHECK (work_week_start_dow BETWEEN 0 AND 6),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

COMMENT ON COLUMN public.settlement_settings.rm_deposit_target IS
  'Repair & Maintenance Deposit target. This is the driver''s own money held against repairs; it is never to be described as anything else.';
COMMENT ON COLUMN public.settlement_settings.work_week_start_dow IS
  'Day of week the work week starts, Postgres dow numbering. 3 = Wednesday.';

GRANT SELECT, INSERT, UPDATE ON public.settlement_settings TO authenticated;
GRANT ALL ON public.settlement_settings TO service_role;
ALTER TABLE public.settlement_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read settlement settings"
ON public.settlement_settings FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'dispatcher')
  OR public.has_role(auth.uid(), 'management')
  OR public.has_role(auth.uid(), 'owner')
);
CREATE POLICY "Management can create settlement settings"
ON public.settlement_settings FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Management can update settlement settings"
ON public.settlement_settings FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE TABLE public.settlement_settings_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field text NOT NULL,
  previous_value text,
  new_value text,
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_settlement_settings_history_changed_at ON public.settlement_settings_history(changed_at DESC);

GRANT SELECT ON public.settlement_settings_history TO authenticated;
GRANT ALL ON public.settlement_settings_history TO service_role;
ALTER TABLE public.settlement_settings_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Management can read settlement settings history"
ON public.settlement_settings_history FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE OR REPLACE FUNCTION public.record_settlement_settings_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
DECLARE
  _actor uuid;
  _f text;
  _old text;
  _new text;
BEGIN
  _actor := public.current_profile_id();
  NEW.updated_at := now();
  NEW.updated_by := _actor;

  FOREACH _f IN ARRAY ARRAY[
    'minimum_net_pay_threshold','hold_buffer','equipment_value_per_driver',
    'rm_deposit_target','rm_weekly_deduction','work_week_start_dow'
  ] LOOP
    EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', _f, _f)
      INTO _old, _new USING OLD, NEW;
    IF _old IS DISTINCT FROM _new THEN
      INSERT INTO public.settlement_settings_history (field, previous_value, new_value, changed_by)
      VALUES (_f, _old, _new, _actor);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_settlement_settings_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_settlement_settings_change() FROM anon;
REVOKE ALL ON FUNCTION public.record_settlement_settings_change() FROM authenticated;

CREATE TRIGGER trg_settlement_settings_history
BEFORE UPDATE ON public.settlement_settings
FOR EACH ROW EXECUTE FUNCTION public.record_settlement_settings_change();

INSERT INTO public.settlement_settings (singleton) VALUES (true);

-- ============================================================
-- Part B: settlement tables
-- ============================================================

CREATE TYPE public.settlement_status AS ENUM
  ('upcoming','processing','paid','held','below_threshold');

CREATE TABLE public.settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  payday date,
  status public.settlement_status NOT NULL DEFAULT 'upcoming',
  gross_amount numeric(12,2) NOT NULL DEFAULT 0,
  deductions_amount numeric(12,2) NOT NULL DEFAULT 0,
  net_amount numeric(12,2) NOT NULL DEFAULT 0,
  carry_forward_in numeric(12,2) NOT NULL DEFAULT 0,
  carry_forward_out numeric(12,2) NOT NULL DEFAULT 0,
  -- HELD: computed and visible, only payment is withheld.
  hold_reason text,
  held_at timestamptz,
  hold_released_at timestamptz,
  hold_released_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  hold_release_reason text,
  -- BELOW_THRESHOLD: management may authorise payment anyway.
  below_threshold_authorized_at timestamptz,
  below_threshold_authorized_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  below_threshold_authorization_reason text,
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (operator_id, period_start)
);
CREATE INDEX idx_settlements_operator ON public.settlements(operator_id);
CREATE INDEX idx_settlements_period ON public.settlements(period_start, period_end);
CREATE INDEX idx_settlements_status ON public.settlements(status);

CREATE TABLE public.settlement_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES public.settlements(id) ON DELETE CASCADE,
  line_type text NOT NULL CHECK (line_type IN (
    'load_pay','accessorial','reimbursement','fuel','cash_advance',
    'deduction','rm_deposit','carry_forward','adjustment'
  )),
  amount numeric(12,2) NOT NULL DEFAULT 0,
  description text,
  source_table text CHECK (source_table IN (
    'loads','fuel_transactions','deductions','deduction_installments',
    'cash_advances','rm_deposits','settlements'
  )),
  source_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
CREATE INDEX idx_settlement_line_items_settlement ON public.settlement_line_items(settlement_id);
CREATE INDEX idx_settlement_line_items_source ON public.settlement_line_items(source_table, source_id);

CREATE TABLE public.deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  label text NOT NULL,
  category text,
  amount numeric(12,2) NOT NULL,
  is_recurring boolean NOT NULL DEFAULT false,
  start_payday date,
  end_payday date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
CREATE INDEX idx_deductions_operator ON public.deductions(operator_id);

CREATE TABLE public.deduction_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deduction_id uuid NOT NULL REFERENCES public.deductions(id) ON DELETE CASCADE,
  installment_number integer NOT NULL CHECK (installment_number > 0),
  installment_total integer NOT NULL CHECK (installment_total > 0),
  amount numeric(12,2) NOT NULL,
  due_payday date,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','applied','skipped')),
  settlement_id uuid REFERENCES public.settlements(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (deduction_id, installment_number)
);
CREATE INDEX idx_deduction_installments_deduction ON public.deduction_installments(deduction_id);

-- Repair & Maintenance Deposit. Never described as anything else.
CREATE TABLE public.rm_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL UNIQUE REFERENCES public.operators(id) ON DELETE CASCADE,
  current_balance numeric(12,2) NOT NULL DEFAULT 0,
  target_amount numeric(12,2),
  weekly_deduction numeric(12,2),
  is_paused boolean NOT NULL DEFAULT false,
  last_deduction_payday date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
COMMENT ON TABLE public.rm_deposits IS
  'Repair & Maintenance Deposit per driver. The driver''s own money, held against repairs, refundable. target_amount / weekly_deduction fall back to settlement_settings when null.';

CREATE TABLE public.rm_deposit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rm_deposit_id uuid NOT NULL REFERENCES public.rm_deposits(id) ON DELETE CASCADE,
  transaction_type text NOT NULL CHECK (transaction_type IN ('contribution','withdrawal','refund','adjustment')),
  amount numeric(12,2) NOT NULL,
  balance_after numeric(12,2),
  description text,
  settlement_id uuid REFERENCES public.settlements(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
CREATE INDEX idx_rm_deposit_transactions_deposit ON public.rm_deposit_transactions(rm_deposit_id);

CREATE TABLE public.cash_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  source text,
  issued_on date NOT NULL DEFAULT CURRENT_DATE,
  remaining_balance numeric(12,2) NOT NULL DEFAULT 0,
  repayment_status text NOT NULL DEFAULT 'outstanding'
    CHECK (repayment_status IN ('outstanding','repaying','repaid','written_off')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
CREATE INDEX idx_cash_advances_operator ON public.cash_advances(operator_id);

-- Grants + RLS: financial data is management/owner only. No operator access at all.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settlements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settlement_line_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deductions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deduction_installments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rm_deposits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rm_deposit_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_advances TO authenticated;
GRANT ALL ON public.settlements TO service_role;
GRANT ALL ON public.settlement_line_items TO service_role;
GRANT ALL ON public.deductions TO service_role;
GRANT ALL ON public.deduction_installments TO service_role;
GRANT ALL ON public.rm_deposits TO service_role;
GRANT ALL ON public.rm_deposit_transactions TO service_role;
GRANT ALL ON public.cash_advances TO service_role;

ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deduction_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rm_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rm_deposit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_advances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Management manages settlements"
ON public.settlements FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Management manages settlement line items"
ON public.settlement_line_items FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Management manages deductions"
ON public.deductions FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Management manages deduction installments"
ON public.deduction_installments FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Management manages rm deposits"
ON public.rm_deposits FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Management manages rm deposit transactions"
ON public.rm_deposit_transactions FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Management manages cash advances"
ON public.cash_advances FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

-- ============================================================
-- Part E: the two release paths. One writer per state change.
-- ============================================================

CREATE OR REPLACE FUNCTION public.authorize_below_threshold_payment(
  _settlement_id uuid,
  _reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
DECLARE
  _actor uuid;
  _status public.settlement_status;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner')) THEN
    RAISE EXCEPTION 'Only management may authorise payment below the minimum' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(coalesce(_reason,'')), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required' USING ERRCODE = '23514';
  END IF;

  SELECT status INTO _status FROM public.settlements WHERE id = _settlement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement not found' USING ERRCODE = 'P0002';
  END IF;
  IF _status <> 'below_threshold' THEN
    RAISE EXCEPTION 'Only a below-threshold settlement can be authorised for payment' USING ERRCODE = '23514';
  END IF;

  _actor := public.current_profile_id();

  UPDATE public.settlements
     SET status = 'processing',
         below_threshold_authorized_at = now(),
         below_threshold_authorized_by = _actor,
         below_threshold_authorization_reason = btrim(_reason),
         updated_at = now(),
         updated_by = _actor
   WHERE id = _settlement_id;

  RETURN _settlement_id;
END;
$$;

REVOKE ALL ON FUNCTION public.authorize_below_threshold_payment(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.authorize_below_threshold_payment(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.authorize_below_threshold_payment(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_below_threshold_payment(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.release_settlement_hold(
  _settlement_id uuid,
  _reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
DECLARE
  _actor uuid;
  _status public.settlement_status;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner')) THEN
    RAISE EXCEPTION 'Only management may release a held settlement' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(coalesce(_reason,'')), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required' USING ERRCODE = '23514';
  END IF;

  SELECT status INTO _status FROM public.settlements WHERE id = _settlement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement not found' USING ERRCODE = 'P0002';
  END IF;
  IF _status <> 'held' THEN
    RAISE EXCEPTION 'Only a held settlement can be released' USING ERRCODE = '23514';
  END IF;

  _actor := public.current_profile_id();

  UPDATE public.settlements
     SET status = 'processing',
         hold_released_at = now(),
         hold_released_by = _actor,
         hold_release_reason = btrim(_reason),
         updated_at = now(),
         updated_by = _actor
   WHERE id = _settlement_id;

  RETURN _settlement_id;
END;
$$;

REVOKE ALL ON FUNCTION public.release_settlement_hold(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_settlement_hold(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.release_settlement_hold(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_settlement_hold(uuid, text) TO service_role;