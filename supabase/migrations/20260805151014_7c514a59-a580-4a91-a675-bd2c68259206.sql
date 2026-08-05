CREATE TABLE public.truck_state_permits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  state_code text NOT NULL CHECK (state_code IN ('KY','NM','NY','OR')),
  registered boolean NOT NULL DEFAULT false,
  permit_number text,
  expires_at date,
  document_id uuid REFERENCES public.inspection_documents(id) ON DELETE SET NULL,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operator_id, state_code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.truck_state_permits TO authenticated;
GRANT ALL ON public.truck_state_permits TO service_role;

ALTER TABLE public.truck_state_permits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view truck state permits"
ON public.truck_state_permits FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'management')
  OR public.has_role(auth.uid(), 'owner')
  OR public.has_role(auth.uid(), 'onboarding_staff')
  OR public.has_role(auth.uid(), 'dispatcher')
);

CREATE POLICY "Staff can manage truck state permits"
ON public.truck_state_permits FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'management')
  OR public.has_role(auth.uid(), 'owner')
  OR public.has_role(auth.uid(), 'onboarding_staff')
  OR public.has_role(auth.uid(), 'dispatcher')
)
WITH CHECK (
  public.has_role(auth.uid(), 'management')
  OR public.has_role(auth.uid(), 'owner')
  OR public.has_role(auth.uid(), 'onboarding_staff')
  OR public.has_role(auth.uid(), 'dispatcher')
);

CREATE POLICY "Drivers can view their own truck state permits"
ON public.truck_state_permits FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.operators o
    WHERE o.id = truck_state_permits.operator_id
      AND o.user_id = auth.uid()
  )
);

CREATE INDEX idx_truck_state_permits_operator ON public.truck_state_permits (operator_id);

CREATE TRIGGER update_truck_state_permits_updated_at
BEFORE UPDATE ON public.truck_state_permits
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();