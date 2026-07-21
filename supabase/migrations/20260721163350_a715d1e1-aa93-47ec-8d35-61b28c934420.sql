
CREATE TABLE public.passenger_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID REFERENCES public.operators(id) ON DELETE SET NULL,
  driver_name TEXT NOT NULL,
  unit_number TEXT NOT NULL,
  driver_email TEXT NOT NULL,
  response_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','opened','signed','filed','revoked')),
  passenger_name TEXT,
  passenger_relationship TEXT,
  passenger_dob DATE,
  effective_date DATE,
  contractor_signature_url TEXT,
  contractor_typed_name TEXT,
  contractor_signed_at TIMESTAMPTZ,
  passenger_signature_url TEXT,
  passenger_typed_name TEXT,
  parent_signature_url TEXT,
  parent_typed_name TEXT,
  carrier_signature_url TEXT,
  carrier_typed_name TEXT,
  carrier_title TEXT,
  executed_pdf_url TEXT,
  executed_at TIMESTAMPTZ,
  filed_operator_document_id UUID,
  sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  opened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.passenger_authorizations TO authenticated;
GRANT ALL ON public.passenger_authorizations TO service_role;

ALTER TABLE public.passenger_authorizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage passenger authorizations"
ON public.passenger_authorizations FOR ALL
TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

CREATE INDEX idx_passenger_auth_operator ON public.passenger_authorizations(operator_id);
CREATE INDEX idx_passenger_auth_status ON public.passenger_authorizations(status);

CREATE TRIGGER trg_passenger_auth_updated_at
BEFORE UPDATE ON public.passenger_authorizations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Staff read passenger auth sigs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'passenger-auth-signatures' AND public.is_staff(auth.uid()));

CREATE POLICY "Staff read passenger auth executed"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'passenger-auth-executed' AND public.is_staff(auth.uid()));

CREATE POLICY "Anon upload passenger auth sigs"
ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (bucket_id = 'passenger-auth-signatures');
