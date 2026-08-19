CREATE TYPE public.load_document_type AS ENUM ('rate_confirmation','revised_rate_confirmation','bol','pod','scale_ticket','lumper_receipt','detention_documentation','loadout_pickup_inspection','loadout_delivery_inspection','permit','broker_correspondence','other');
CREATE TYPE public.document_upload_channel AS ENUM ('driver_app','email_forward','office_upload','fax_forward','system_generated');
CREATE TYPE public.document_exception_reason AS ENUM ('shipper_did_not_provide','receiver_refused_to_sign','lost_or_damaged','will_be_emailed_later','electronic_bol_no_paper','facility_closed_no_contact','other');
CREATE TYPE public.document_exception_status AS ENUM ('pending','approved','resolved','denied');

CREATE TABLE public.load_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id uuid NOT NULL REFERENCES public.loads(id) ON DELETE CASCADE,
  load_stop_id uuid REFERENCES public.load_stops(id) ON DELETE SET NULL,
  document_type public.load_document_type NOT NULL,
  document_name text,
  file_url text,
  file_path text,
  file_type text,
  upload_channel public.document_upload_channel NOT NULL DEFAULT 'office_upload',
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  capture_latitude numeric,
  capture_longitude numeric,
  photo_sequence integer,
  photo_label text,
  damage_noted boolean DEFAULT false,
  damage_notes text,
  is_verified boolean DEFAULT false,
  verified_at timestamptz,
  verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.document_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id uuid NOT NULL REFERENCES public.loads(id) ON DELETE CASCADE,
  load_stop_id uuid REFERENCES public.load_stops(id) ON DELETE SET NULL,
  document_type public.load_document_type NOT NULL,
  reason public.document_exception_reason NOT NULL,
  driver_notes text NOT NULL,
  ebol_reference_number text,
  status public.document_exception_status NOT NULL DEFAULT 'pending',
  reported_at timestamptz NOT NULL DEFAULT now(),
  reported_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  report_latitude numeric,
  report_longitude numeric,
  resolution_notes text,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolving_document_id uuid REFERENCES public.load_documents(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.load_documents TO authenticated;
GRANT ALL ON public.load_documents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_exceptions TO authenticated;
GRANT ALL ON public.document_exceptions TO service_role;

ALTER TABLE public.load_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_exceptions ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_load_documents_load_id ON public.load_documents(load_id);
CREATE INDEX idx_load_documents_document_type ON public.load_documents(document_type);
CREATE INDEX idx_load_documents_load_stop_id ON public.load_documents(load_stop_id);
CREATE INDEX idx_document_exceptions_load_id ON public.document_exceptions(load_id);
CREATE INDEX idx_document_exceptions_status ON public.document_exceptions(status);
CREATE INDEX idx_document_exceptions_document_type ON public.document_exceptions(document_type);

CREATE TRIGGER trg_load_documents_updated_at BEFORE UPDATE ON public.load_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_document_exceptions_updated_at BEFORE UPDATE ON public.document_exceptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- load_documents policies
CREATE POLICY "load_documents_staff_manage" ON public.load_documents
FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'dispatcher'))
WITH CHECK (public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'dispatcher'));

CREATE POLICY "load_documents_onboarding_read" ON public.load_documents
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'onboarding_staff'));

CREATE POLICY "load_documents_operator_read_own" ON public.load_documents
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.loads l JOIN public.operators o ON o.id = l.operator_id
  WHERE l.id = load_documents.load_id AND o.user_id = auth.uid()
));

CREATE POLICY "load_documents_operator_insert_own" ON public.load_documents
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.loads l JOIN public.operators o ON o.id = l.operator_id
  WHERE l.id = load_documents.load_id AND o.user_id = auth.uid()
));

-- document_exceptions policies
CREATE POLICY "document_exceptions_staff_manage" ON public.document_exceptions
FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'dispatcher'))
WITH CHECK (public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'dispatcher'));

CREATE POLICY "document_exceptions_onboarding_read" ON public.document_exceptions
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'onboarding_staff'));

CREATE POLICY "document_exceptions_operator_read_own" ON public.document_exceptions
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.loads l JOIN public.operators o ON o.id = l.operator_id
  WHERE l.id = document_exceptions.load_id AND o.user_id = auth.uid()
));

CREATE POLICY "document_exceptions_operator_insert_own" ON public.document_exceptions
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.loads l JOIN public.operators o ON o.id = l.operator_id
  WHERE l.id = document_exceptions.load_id AND o.user_id = auth.uid()
));