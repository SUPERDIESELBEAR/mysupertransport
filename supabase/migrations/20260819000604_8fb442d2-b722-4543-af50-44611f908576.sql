CREATE TYPE public.broker_factoring_status AS ENUM ('approved', 'not_approved', 'unknown', 'pending');

CREATE TABLE public.brokers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  mc_number text,
  dot_number text,
  primary_contact_name text,
  primary_contact_email text,
  primary_contact_phone text,
  billing_email text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  zip text,
  factoring_status public.broker_factoring_status NOT NULL DEFAULT 'unknown',
  factoring_status_reason text,
  factoring_status_updated_at timestamptz,
  payment_terms text,
  avg_days_to_pay integer,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brokers TO authenticated;
GRANT ALL ON public.brokers TO service_role;
ALTER TABLE public.brokers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brokers_mgmt_all" ON public.brokers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));
CREATE POLICY "brokers_staff_select" ON public.brokers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'dispatcher') OR public.has_role(auth.uid(), 'onboarding_staff'));
CREATE POLICY "brokers_staff_insert" ON public.brokers FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'dispatcher') OR public.has_role(auth.uid(), 'onboarding_staff'));
CREATE POLICY "brokers_staff_update" ON public.brokers FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'dispatcher') OR public.has_role(auth.uid(), 'onboarding_staff'))
  WITH CHECK (public.has_role(auth.uid(), 'dispatcher') OR public.has_role(auth.uid(), 'onboarding_staff'));

CREATE TABLE public.broker_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id uuid NOT NULL REFERENCES public.brokers(id) ON DELETE CASCADE,
  document_category text NOT NULL,
  document_name text NOT NULL,
  file_url text,
  file_path text,
  expiration_date date,
  notes text,
  version_number integer NOT NULL DEFAULT 1,
  is_current_version boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broker_documents TO authenticated;
GRANT ALL ON public.broker_documents TO service_role;
ALTER TABLE public.broker_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broker_documents_mgmt_all" ON public.broker_documents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));
CREATE POLICY "broker_documents_staff_select" ON public.broker_documents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'dispatcher') OR public.has_role(auth.uid(), 'onboarding_staff'));
CREATE POLICY "broker_documents_staff_insert" ON public.broker_documents FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'dispatcher') OR public.has_role(auth.uid(), 'onboarding_staff'));
CREATE POLICY "broker_documents_staff_update" ON public.broker_documents FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'dispatcher') OR public.has_role(auth.uid(), 'onboarding_staff'))
  WITH CHECK (public.has_role(auth.uid(), 'dispatcher') OR public.has_role(auth.uid(), 'onboarding_staff'));

CREATE TABLE public.broker_factoring_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id uuid NOT NULL REFERENCES public.brokers(id) ON DELETE CASCADE,
  previous_status public.broker_factoring_status,
  new_status public.broker_factoring_status NOT NULL,
  reason text,
  documentation_url text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid REFERENCES public.profiles(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broker_factoring_history TO authenticated;
GRANT ALL ON public.broker_factoring_history TO service_role;
ALTER TABLE public.broker_factoring_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broker_factoring_history_mgmt_all" ON public.broker_factoring_history FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));
CREATE POLICY "broker_factoring_history_staff_select" ON public.broker_factoring_history FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'dispatcher') OR public.has_role(auth.uid(), 'onboarding_staff'));

CREATE INDEX idx_broker_documents_broker_id ON public.broker_documents (broker_id);
CREATE INDEX idx_broker_factoring_history_broker_id ON public.broker_factoring_history (broker_id);
CREATE INDEX idx_brokers_company_name ON public.brokers (company_name);
CREATE INDEX idx_brokers_factoring_status ON public.brokers (factoring_status);

CREATE TRIGGER update_brokers_updated_at BEFORE UPDATE ON public.brokers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_broker_documents_updated_at BEFORE UPDATE ON public.broker_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.stamp_broker_factoring_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.factoring_status_updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER stamp_brokers_factoring_status
  BEFORE UPDATE OF factoring_status ON public.brokers
  FOR EACH ROW
  WHEN (OLD.factoring_status IS DISTINCT FROM NEW.factoring_status)
  EXECUTE FUNCTION public.stamp_broker_factoring_status_change();

CREATE OR REPLACE FUNCTION public.log_broker_factoring_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.broker_factoring_history (broker_id, previous_status, new_status, reason, changed_by)
  VALUES (NEW.id, OLD.factoring_status, NEW.factoring_status, NEW.factoring_status_reason, auth.uid());
  RETURN NULL;
END;
$$;

CREATE TRIGGER log_brokers_factoring_change
  AFTER UPDATE OF factoring_status ON public.brokers
  FOR EACH ROW
  WHEN (OLD.factoring_status IS DISTINCT FROM NEW.factoring_status)
  EXECUTE FUNCTION public.log_broker_factoring_change();