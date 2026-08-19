CREATE TYPE public.company_document_category AS ENUM ('authority_registration','tax_financial','insurance','operating','contract_template','company_policy','other');

CREATE TABLE public.company_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_name text NOT NULL,
  category public.company_document_category NOT NULL DEFAULT 'other',
  description text,
  file_url text,
  file_path text,
  file_type text,
  expiration_date date,
  version_number integer NOT NULL DEFAULT 1,
  is_current_version boolean NOT NULL DEFAULT true,
  superseded_by_id uuid REFERENCES public.company_documents(id) ON DELETE SET NULL,
  is_sendable boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_documents TO authenticated;
GRANT ALL ON public.company_documents TO service_role;

ALTER TABLE public.company_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_documents_select_staff" ON public.company_documents
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner')
  OR public.has_role(auth.uid(),'dispatcher') OR public.has_role(auth.uid(),'onboarding_staff')
);

CREATE POLICY "company_documents_insert_mgmt" ON public.company_documents
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner'));

CREATE POLICY "company_documents_update_mgmt" ON public.company_documents
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner'))
WITH CHECK (public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner'));

CREATE POLICY "company_documents_delete_mgmt" ON public.company_documents
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner'));

CREATE TABLE public.document_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_document_id uuid NOT NULL REFERENCES public.company_documents(id) ON DELETE CASCADE,
  broker_id uuid REFERENCES public.brokers(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  recipient_name text,
  subject text,
  message_body text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_by uuid REFERENCES public.profiles(id),
  send_status text NOT NULL DEFAULT 'sent',
  notes text
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_send_log TO authenticated;
GRANT ALL ON public.document_send_log TO service_role;

ALTER TABLE public.document_send_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "document_send_log_select_staff" ON public.document_send_log
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner')
  OR public.has_role(auth.uid(),'dispatcher') OR public.has_role(auth.uid(),'onboarding_staff')
);

CREATE POLICY "document_send_log_insert_staff" ON public.document_send_log
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner')
  OR public.has_role(auth.uid(),'dispatcher') OR public.has_role(auth.uid(),'onboarding_staff')
);

CREATE POLICY "document_send_log_update_mgmt" ON public.document_send_log
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner'))
WITH CHECK (public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner'));

CREATE POLICY "document_send_log_delete_mgmt" ON public.document_send_log
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner'));

CREATE INDEX idx_company_documents_category ON public.company_documents (category);
CREATE INDEX idx_company_documents_is_current_version ON public.company_documents (is_current_version);
CREATE INDEX idx_company_documents_expiration_date ON public.company_documents (expiration_date);
CREATE INDEX idx_document_send_log_company_document_id ON public.document_send_log (company_document_id);
CREATE INDEX idx_document_send_log_broker_id ON public.document_send_log (broker_id);
CREATE INDEX idx_document_send_log_sent_at ON public.document_send_log (sent_at);

CREATE TRIGGER update_company_documents_updated_at
BEFORE UPDATE ON public.company_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.company_documents_set_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  max_version integer;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) INTO max_version
  FROM public.company_documents
  WHERE document_name = NEW.document_name;

  NEW.version_number := max_version + 1;
  NEW.is_current_version := true;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.company_documents_supersede_prior()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.company_documents
  SET is_current_version = false,
      superseded_by_id = NEW.id
  WHERE document_name = NEW.document_name
    AND id <> NEW.id
    AND is_current_version;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.company_documents_set_version() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.company_documents_supersede_prior() FROM public, anon, authenticated;

CREATE TRIGGER company_documents_set_version_before_insert
BEFORE INSERT ON public.company_documents
FOR EACH ROW EXECUTE FUNCTION public.company_documents_set_version();

CREATE TRIGGER company_documents_supersede_prior_after_insert
AFTER INSERT ON public.company_documents
FOR EACH ROW EXECUTE FUNCTION public.company_documents_supersede_prior();