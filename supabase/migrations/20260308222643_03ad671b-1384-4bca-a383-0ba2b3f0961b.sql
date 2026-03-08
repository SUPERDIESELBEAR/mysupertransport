
-- Create ICA contracts table
CREATE TABLE public.ica_contracts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operator_id UUID NOT NULL REFERENCES public.operators(id),

  -- Appendix A — Equipment (staff-filled)
  truck_year TEXT,
  truck_make TEXT,
  truck_model TEXT,
  truck_vin TEXT,
  truck_plate TEXT,
  truck_plate_state TEXT,
  trailer_number TEXT,
  owner_business_name TEXT,
  owner_ein_ssn TEXT,
  owner_address TEXT,
  owner_city TEXT,
  owner_state TEXT,
  owner_zip TEXT,
  owner_phone TEXT,
  owner_email TEXT,

  -- Appendix B — Compensation (editable)
  linehaul_split_pct INTEGER NOT NULL DEFAULT 72,

  -- Appendix C — Equipment Receipt (staff-filled, Condition/Comments removed)
  lease_effective_date DATE,
  lease_termination_date DATE,
  equipment_location TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'draft',

  -- Carrier (staff) signature
  carrier_signed_by UUID,
  carrier_typed_name TEXT,
  carrier_title TEXT,
  carrier_signature_url TEXT,
  carrier_signed_at TIMESTAMPTZ,

  -- Contractor (operator) signature
  contractor_typed_name TEXT,
  contractor_signature_url TEXT,
  contractor_signed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ica_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view all ICA contracts"
  ON public.ica_contracts FOR SELECT
  USING (is_staff(auth.uid()));

CREATE POLICY "Staff can insert ICA contracts"
  ON public.ica_contracts FOR INSERT
  WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Staff can update ICA contracts"
  ON public.ica_contracts FOR UPDATE
  USING (is_staff(auth.uid()));

CREATE POLICY "Operators can view their own ICA contracts"
  ON public.ica_contracts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.operators
    WHERE operators.id = ica_contracts.operator_id
      AND operators.user_id = auth.uid()
  ));

CREATE POLICY "Operators can sign their own ICA contracts"
  ON public.ica_contracts FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.operators
    WHERE operators.id = ica_contracts.operator_id
      AND operators.user_id = auth.uid()
  ));

CREATE TRIGGER update_ica_contracts_updated_at
  BEFORE UPDATE ON public.ica_contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public)
VALUES ('ica-signatures', 'ica-signatures', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload ICA signatures"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'ica-signatures' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view ICA signatures"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'ica-signatures' AND auth.uid() IS NOT NULL);
