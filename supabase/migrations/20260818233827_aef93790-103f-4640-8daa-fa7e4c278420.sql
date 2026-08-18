CREATE TABLE public.pay_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_company_default boolean NOT NULL DEFAULT false,
  linehaul_pct numeric NOT NULL DEFAULT 72.00,
  fsc_pct numeric NOT NULL DEFAULT 72.00,
  detention_pct numeric NOT NULL DEFAULT 100.00,
  layover_pct numeric NOT NULL DEFAULT 100.00,
  tonu_pct numeric NOT NULL DEFAULT 72.00,
  stopoff_pct numeric NOT NULL DEFAULT 72.00,
  lumper_reimbursement_pct numeric NOT NULL DEFAULT 100.00,
  per_ton_pct numeric NOT NULL DEFAULT 72.00,
  loadout_pct numeric NOT NULL DEFAULT 72.00,
  other_accessorial_pct numeric NOT NULL DEFAULT 72.00,
  is_active boolean NOT NULL DEFAULT true,
  effective_date date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pay_policies TO authenticated;
GRANT ALL ON public.pay_policies TO service_role;

ALTER TABLE public.pay_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pay_policies_read_authenticated"
  ON public.pay_policies FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'dispatcher')
    OR public.has_role(auth.uid(), 'onboarding_staff')
    OR public.has_role(auth.uid(), 'operator')
  );

CREATE POLICY "pay_policies_insert_management"
  ON public.pay_policies FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "pay_policies_update_management"
  ON public.pay_policies FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "pay_policies_delete_management"
  ON public.pay_policies FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE UNIQUE INDEX pay_policies_single_company_default
  ON public.pay_policies (is_company_default) WHERE is_company_default;

CREATE TRIGGER update_pay_policies_updated_at
  BEFORE UPDATE ON public.pay_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.pay_policy_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  pay_policy_id uuid NOT NULL REFERENCES public.pay_policies(id) ON DELETE RESTRICT,
  effective_start_date date NOT NULL DEFAULT current_date,
  effective_end_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pay_policy_assignments TO authenticated;
GRANT ALL ON public.pay_policy_assignments TO service_role;

ALTER TABLE public.pay_policy_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pay_policy_assignments_read_staff"
  ON public.pay_policy_assignments FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'dispatcher')
    OR public.has_role(auth.uid(), 'onboarding_staff')
    OR EXISTS (
      SELECT 1 FROM public.operators o
      WHERE o.id = pay_policy_assignments.operator_id
        AND o.user_id = auth.uid()
    )
  );

CREATE POLICY "pay_policy_assignments_insert_management"
  ON public.pay_policy_assignments FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "pay_policy_assignments_update_management"
  ON public.pay_policy_assignments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "pay_policy_assignments_delete_management"
  ON public.pay_policy_assignments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE INDEX idx_pay_policy_assignments_operator_id ON public.pay_policy_assignments (operator_id);
CREATE INDEX idx_pay_policy_assignments_pay_policy_id ON public.pay_policy_assignments (pay_policy_id);

CREATE TRIGGER update_pay_policy_assignments_updated_at
  BEFORE UPDATE ON public.pay_policy_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.pay_policies (name, description, is_company_default)
SELECT 'SUPERTRANSPORT Standard', 'Default company pay policy for owner-operators.', true
WHERE NOT EXISTS (SELECT 1 FROM public.pay_policies WHERE name = 'SUPERTRANSPORT Standard');