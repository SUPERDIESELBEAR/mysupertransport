
-- Create contractor_pay_setup table for Stage 8 of operator onboarding
CREATE TABLE public.contractor_pay_setup (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id       uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  contractor_type   text NOT NULL CHECK (contractor_type IN ('individual', 'business')),
  legal_first_name  text NOT NULL,
  legal_last_name   text NOT NULL,
  business_name     text,
  phone             text NOT NULL,
  email             text NOT NULL,
  terms_accepted    boolean NOT NULL DEFAULT false,
  terms_accepted_at timestamp with time zone,
  submitted_at      timestamp with time zone,
  updated_at        timestamp with time zone NOT NULL DEFAULT now(),
  created_at        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT contractor_pay_setup_operator_unique UNIQUE (operator_id)
);

ALTER TABLE public.contractor_pay_setup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators can view their own pay setup"
  ON public.contractor_pay_setup FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.operators WHERE operators.id = contractor_pay_setup.operator_id AND operators.user_id = auth.uid()));

CREATE POLICY "Operators can insert their own pay setup"
  ON public.contractor_pay_setup FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.operators WHERE operators.id = contractor_pay_setup.operator_id AND operators.user_id = auth.uid()));

CREATE POLICY "Operators can update their own pay setup"
  ON public.contractor_pay_setup FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.operators WHERE operators.id = contractor_pay_setup.operator_id AND operators.user_id = auth.uid()));

CREATE POLICY "Staff can view all pay setup records"
  ON public.contractor_pay_setup FOR SELECT
  USING (is_staff(auth.uid()));

CREATE POLICY "Staff can update pay setup records"
  ON public.contractor_pay_setup FOR UPDATE
  USING (is_staff(auth.uid()));

CREATE TRIGGER update_contractor_pay_setup_updated_at
  BEFORE UPDATE ON public.contractor_pay_setup
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
