CREATE TABLE public.invoice_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.carrier_profile(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_by uuid NOT NULL,
  to_emails text[] NOT NULL,
  cc_emails text[] NOT NULL DEFAULT '{}',
  subject text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  packet_style text NOT NULL CHECK (packet_style IN ('combined','separate')),
  provider_message_id text,
  status text NOT NULL CHECK (status IN ('sent','failed')),
  error text,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invoice_sends_invoice_idx ON public.invoice_sends (invoice_id, sent_at DESC);
CREATE INDEX invoice_sends_company_idx ON public.invoice_sends (company_id);

GRANT SELECT ON public.invoice_sends TO authenticated;
GRANT ALL ON public.invoice_sends TO service_role;
ALTER TABLE public.invoice_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.invoice_sends AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));
CREATE POLICY invoice_sends_view_permission ON public.invoice_sends FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('invoice.view')));

CREATE OR REPLACE FUNCTION public.stamp_invoice_send_company()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  SELECT company_id INTO NEW.company_id FROM public.invoices WHERE id = NEW.invoice_id;
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found.' USING ERRCODE = 'P0002';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.stamp_invoice_send_company() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER aa_stamp_invoice_send_company BEFORE INSERT ON public.invoice_sends
  FOR EACH ROW EXECUTE FUNCTION public.stamp_invoice_send_company();

CREATE OR REPLACE FUNCTION public.enforce_invoice_send_append_only()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  RAISE EXCEPTION 'Invoice send records cannot be changed or deleted.' USING ERRCODE = '42501';
END $$;
CREATE TRIGGER invoice_sends_append_only BEFORE UPDATE OR DELETE ON public.invoice_sends
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invoice_send_append_only();

CREATE OR REPLACE FUNCTION public.record_invoice_send(
  p_invoice_id uuid, p_sent_by uuid, p_to text[], p_cc text[], p_subject text,
  p_attachments jsonb, p_packet_style text, p_provider_message_id text,
  p_status text, p_error text, p_is_test boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_inv public.invoices%ROWTYPE;
  v_id uuid;
  v_first boolean := false;
  v_claims text;
  v_actor text;
BEGIN
  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found.' USING ERRCODE = 'P0002'; END IF;

  INSERT INTO public.invoice_sends (invoice_id, company_id, sent_by, to_emails, cc_emails, subject,
    attachments, packet_style, provider_message_id, status, error, is_test)
  VALUES (p_invoice_id, v_inv.company_id, p_sent_by, p_to, coalesce(p_cc,'{}'), p_subject,
    coalesce(p_attachments,'[]'::jsonb), p_packet_style, p_provider_message_id, p_status, p_error,
    coalesce(p_is_test,false))
  RETURNING id INTO v_id;

  IF p_status = 'sent' AND NOT coalesce(p_is_test,false) AND v_inv.submitted_at IS NULL THEN
    v_first := true;
    v_claims := current_setting('request.jwt.claims', true);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', p_sent_by, 'role', 'service_role')::text, true);
    UPDATE public.invoices SET submitted_at = now() WHERE id = p_invoice_id;
    PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);

    SELECT nullif(btrim(concat_ws(' ', first_name, last_name)), '') INTO v_actor
      FROM public.profiles WHERE user_id = p_sent_by LIMIT 1;
    INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
    VALUES (p_sent_by, v_actor, 'invoice_submitted_to_factor', 'invoice', p_invoice_id, v_inv.invoice_number,
      jsonb_build_object('invoice_send_id', v_id, 'to', p_to, 'cc', coalesce(p_cc,'{}'),
        'provider_message_id', p_provider_message_id, 'company_id', v_inv.company_id));
  END IF;

  RETURN jsonb_build_object('invoice_send_id', v_id, 'submitted', v_first);
END $$;
REVOKE ALL ON FUNCTION public.record_invoice_send(uuid,uuid,text[],text[],text,jsonb,text,text,text,text,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_invoice_send(uuid,uuid,text[],text[],text,jsonb,text,text,text,text,boolean)
  TO service_role;