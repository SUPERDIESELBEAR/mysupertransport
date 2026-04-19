-- 1. Add pay_percentage to operators
ALTER TABLE public.operators
  ADD COLUMN IF NOT EXISTS pay_percentage integer NOT NULL DEFAULT 72
  CHECK (pay_percentage > 0 AND pay_percentage <= 100);

-- 2. forecast_loads
CREATE TABLE public.forecast_loads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  delivery_date date NOT NULL,
  delivery_city text,
  delivery_state text,
  load_rate numeric(10,2) NOT NULL CHECK (load_rate >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_forecast_loads_operator_date ON public.forecast_loads(operator_id, delivery_date);

ALTER TABLE public.forecast_loads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators view own forecast loads"
  ON public.forecast_loads FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.operators o WHERE o.id = forecast_loads.operator_id AND o.user_id = auth.uid())
    OR public.is_staff(auth.uid())
  );

CREATE POLICY "Operators insert own forecast loads"
  ON public.forecast_loads FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.operators o WHERE o.id = forecast_loads.operator_id AND o.user_id = auth.uid())
  );

CREATE POLICY "Operators update own forecast loads"
  ON public.forecast_loads FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.operators o WHERE o.id = forecast_loads.operator_id AND o.user_id = auth.uid())
  );

CREATE POLICY "Operators delete own forecast loads"
  ON public.forecast_loads FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.operators o WHERE o.id = forecast_loads.operator_id AND o.user_id = auth.uid())
  );

CREATE TRIGGER trg_forecast_loads_updated_at
  BEFORE UPDATE ON public.forecast_loads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. forecast_expenses
CREATE TABLE public.forecast_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  expense_date date NOT NULL,
  expense_type text NOT NULL CHECK (expense_type IN ('fuel','advance')),
  amount numeric(10,2) NOT NULL CHECK (amount >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_forecast_expenses_operator_date ON public.forecast_expenses(operator_id, expense_date);

ALTER TABLE public.forecast_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators view own forecast expenses"
  ON public.forecast_expenses FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.operators o WHERE o.id = forecast_expenses.operator_id AND o.user_id = auth.uid())
    OR public.is_staff(auth.uid())
  );

CREATE POLICY "Operators insert own forecast expenses"
  ON public.forecast_expenses FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.operators o WHERE o.id = forecast_expenses.operator_id AND o.user_id = auth.uid())
  );

CREATE POLICY "Operators update own forecast expenses"
  ON public.forecast_expenses FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.operators o WHERE o.id = forecast_expenses.operator_id AND o.user_id = auth.uid())
  );

CREATE POLICY "Operators delete own forecast expenses"
  ON public.forecast_expenses FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.operators o WHERE o.id = forecast_expenses.operator_id AND o.user_id = auth.uid())
  );

CREATE TRIGGER trg_forecast_expenses_updated_at
  BEFORE UPDATE ON public.forecast_expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. forecast_deductions
CREATE TABLE public.forecast_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  label text NOT NULL,
  payday_date date NOT NULL,
  amount numeric(10,2) NOT NULL CHECK (amount >= 0),
  group_id uuid,
  installment_number integer,
  installment_total integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_forecast_deductions_operator_payday ON public.forecast_deductions(operator_id, payday_date);
CREATE INDEX idx_forecast_deductions_group ON public.forecast_deductions(group_id);

ALTER TABLE public.forecast_deductions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators view own forecast deductions"
  ON public.forecast_deductions FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.operators o WHERE o.id = forecast_deductions.operator_id AND o.user_id = auth.uid())
    OR public.is_staff(auth.uid())
  );

CREATE POLICY "Operators insert own forecast deductions"
  ON public.forecast_deductions FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.operators o WHERE o.id = forecast_deductions.operator_id AND o.user_id = auth.uid())
  );

CREATE POLICY "Operators update own forecast deductions"
  ON public.forecast_deductions FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.operators o WHERE o.id = forecast_deductions.operator_id AND o.user_id = auth.uid())
  );

CREATE POLICY "Operators delete own forecast deductions"
  ON public.forecast_deductions FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.operators o WHERE o.id = forecast_deductions.operator_id AND o.user_id = auth.uid())
  );

CREATE TRIGGER trg_forecast_deductions_updated_at
  BEFORE UPDATE ON public.forecast_deductions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();