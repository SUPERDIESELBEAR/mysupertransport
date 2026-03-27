
-- Create inspection_binder_order table
CREATE TABLE public.inspection_binder_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL UNIQUE CHECK (scope IN ('company_wide', 'per_driver')),
  doc_order jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid
);

-- Enable RLS
ALTER TABLE public.inspection_binder_order ENABLE ROW LEVEL SECURITY;

-- Staff can read/write
CREATE POLICY "Staff can manage binder order"
  ON public.inspection_binder_order FOR ALL
  USING (is_staff(auth.uid()))
  WITH CHECK (is_staff(auth.uid()));

-- Operators can read (to display same order)
CREATE POLICY "Authenticated users can read binder order"
  ON public.inspection_binder_order FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Seed default order
INSERT INTO public.inspection_binder_order (scope, doc_order) VALUES
  ('company_wide', '["IFTA License","Insurance","UCR","MC Authority","State Specific Permits","Overweight/Oversize Permits","Hazmat","ELD Procedures","Accident Packet"]'::jsonb),
  ('per_driver', '["IRP Registration (cab card)","CDL (Front)","CDL (Back)","Medical Certificate","DOT Inspections","Lease Agreement"]'::jsonb);
