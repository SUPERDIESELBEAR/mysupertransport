-- 0068 — Alvys milestone 2, pass 2: billing settings, factoring company record,
-- invoice PDF file record, and the two pass-1 fixes (P69–P72).

CREATE OR REPLACE FUNCTION public.normalize_billing_email_list(p_list text[], p_label text)
RETURNS text[]
LANGUAGE plpgsql IMMUTABLE
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_out text[] := '{}';
  v_e   text;
BEGIN
  IF p_list IS NULL THEN RETURN '{}'; END IF;
  FOREACH v_e IN ARRAY p_list LOOP
    v_e := lower(btrim(coalesce(v_e, '')));
    IF v_e = '' THEN CONTINUE; END IF;
    IF v_e !~ '^[a-z0-9._%+\-]+@[a-z0-9\-]+(\.[a-z0-9\-]+)*\.[a-z]{2,}$' THEN
      RAISE EXCEPTION '"%" is not a valid email address.', v_e USING ERRCODE = '22000';
    END IF;
    IF v_e = ANY (v_out) THEN
      RAISE EXCEPTION '% already lists %.', p_label, v_e USING ERRCODE = '23505';
    END IF;
    v_out := v_out || v_e;
  END LOOP;
  IF cardinality(v_out) > 10 THEN
    RAISE EXCEPTION '% can hold at most 10 addresses.', p_label USING ERRCODE = '22000';
  END IF;
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION public.normalize_billing_email_list(text[], text) FROM PUBLIC, anon;

CREATE TABLE public.billing_settings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL UNIQUE REFERENCES public.carrier_profile(id) ON DELETE RESTRICT,
  remit_to_name      text,
  remit_to_address_1 text,
  remit_to_address_2 text,
  remit_to_city      text,
  remit_to_state     text,
  remit_to_zip       text,
  remit_to_phone     text,
  remit_to_email     text,
  payment_terms_days integer NOT NULL DEFAULT 30 CHECK (payment_terms_days BETWEEN 0 AND 365),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  updated_by uuid DEFAULT auth.uid()
);
GRANT SELECT, INSERT, UPDATE ON public.billing_settings TO authenticated;
GRANT ALL ON public.billing_settings TO service_role;
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.billing_settings AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));
CREATE POLICY billing_settings_staff_read ON public.billing_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'dispatcher') OR public.has_role(auth.uid(),'management')
         OR public.has_role(auth.uid(),'owner'));
CREATE POLICY billing_settings_mgmt_insert ON public.billing_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner'));
CREATE POLICY billing_settings_mgmt_update ON public.billing_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner'));

CREATE TABLE public.factoring_companies (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.carrier_profile(id) ON DELETE RESTRICT,
  name           text NOT NULL CHECK (btrim(name) <> ''),
  is_default     boolean NOT NULL DEFAULT false,
  send_to_emails text[] NOT NULL DEFAULT '{}',
  cc_emails      text[] NOT NULL DEFAULT '{}',
  fee_pct        numeric(5,2) CHECK (fee_pct IS NULL OR (fee_pct >= 0 AND fee_pct <= 100)),
  packet_style   text NOT NULL DEFAULT 'combined' CHECK (packet_style IN ('combined','separate')),
  packet_order   text[] NOT NULL DEFAULT ARRAY[
    'invoice','bol','pod','rate_confirmation','revised_rate_confirmation','lumper_receipt',
    'scale_ticket','detention_documentation','loadout_pickup_inspection',
    'loadout_delivery_inspection','permit','broker_correspondence','reimbursement_proof','other'],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  updated_by uuid DEFAULT auth.uid()
);
CREATE UNIQUE INDEX factoring_companies_one_default ON public.factoring_companies (company_id) WHERE is_default;
CREATE UNIQUE INDEX factoring_companies_name_key ON public.factoring_companies (company_id, lower(name));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.factoring_companies TO authenticated;
GRANT ALL ON public.factoring_companies TO service_role;
ALTER TABLE public.factoring_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.factoring_companies AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));
CREATE POLICY factoring_companies_staff_read ON public.factoring_companies FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'dispatcher') OR public.has_role(auth.uid(),'management')
         OR public.has_role(auth.uid(),'owner'));
CREATE POLICY factoring_companies_mgmt_write ON public.factoring_companies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner'));

CREATE OR REPLACE FUNCTION public.validate_billing_settings()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $$
DECLARE v_arr text[];
BEGIN
  IF nullif(btrim(coalesce(NEW.remit_to_email,'')),'') IS NULL THEN
    NEW.remit_to_email := NULL;
  ELSE
    v_arr := public.normalize_billing_email_list(ARRAY[NEW.remit_to_email], 'Remit-to email');
    NEW.remit_to_email := v_arr[1];
  END IF;
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN NEW.updated_by := coalesce(auth.uid(), NEW.updated_by); END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.validate_factoring_company()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_e text;
  v_seen text[] := '{}';
  v_allowed text[];
BEGIN
  NEW.name := btrim(NEW.name);
  NEW.send_to_emails := public.normalize_billing_email_list(NEW.send_to_emails, 'Send-to');
  NEW.cc_emails      := public.normalize_billing_email_list(NEW.cc_emails, 'CC');
  IF NEW.send_to_emails && NEW.cc_emails THEN
    RAISE EXCEPTION 'An address cannot be both a send-to and a CC address.' USING ERRCODE = '23505';
  END IF;

  SELECT array_agg(enumlabel::text) || ARRAY['invoice'] INTO v_allowed
    FROM pg_enum WHERE enumtypid = 'public.load_document_type'::regtype;
  IF NEW.packet_order IS NULL OR cardinality(NEW.packet_order) = 0 THEN
    RAISE EXCEPTION 'The packet order needs at least one document type.' USING ERRCODE = '22000';
  END IF;
  FOREACH v_e IN ARRAY NEW.packet_order LOOP
    IF NOT (v_e = ANY (v_allowed)) THEN
      RAISE EXCEPTION '"%" is not a document type.', v_e USING ERRCODE = '22000';
    END IF;
    IF v_e = ANY (v_seen) THEN
      RAISE EXCEPTION 'The packet order lists "%" twice.', v_e USING ERRCODE = '23505';
    END IF;
    v_seen := v_seen || v_e;
  END LOOP;

  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN NEW.updated_by := coalesce(auth.uid(), NEW.updated_by); END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_billing_settings() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.validate_factoring_company() FROM PUBLIC, anon;

CREATE TRIGGER aa_stamp_tenant_company_id BEFORE INSERT ON public.billing_settings
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();
CREATE TRIGGER validate_billing_settings BEFORE INSERT OR UPDATE ON public.billing_settings
  FOR EACH ROW EXECUTE FUNCTION public.validate_billing_settings();
CREATE TRIGGER aa_stamp_tenant_company_id BEFORE INSERT ON public.factoring_companies
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();
CREATE TRIGGER validate_factoring_company BEFORE INSERT OR UPDATE ON public.factoring_companies
  FOR EACH ROW EXECUTE FUNCTION public.validate_factoring_company();

CREATE TABLE public.invoice_files (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.carrier_profile(id) ON DELETE RESTRICT,
  invoice_id   uuid NOT NULL UNIQUE REFERENCES public.invoices(id) ON DELETE RESTRICT,
  storage_path text NOT NULL UNIQUE,
  sha256       text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size    integer NOT NULL CHECK (byte_size > 0),
  page_count   integer NOT NULL CHECK (page_count > 0),
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.invoice_files TO authenticated;
GRANT ALL ON public.invoice_files TO service_role;
ALTER TABLE public.invoice_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.invoice_files AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));
CREATE POLICY invoice_files_view_permission ON public.invoice_files FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('invoice.view')));
CREATE TRIGGER aa_stamp_tenant_company_id BEFORE INSERT ON public.invoice_files
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

CREATE POLICY invoice_line_items_view_permission ON public.invoice_line_items FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('invoice.view')));

CREATE POLICY invoice_files_same_company_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'invoice-files'
         AND (storage.foldername(name))[1] = (public.current_company_id())::text
         AND public.has_permission('invoice.view'));

CREATE OR REPLACE FUNCTION public.post_invoice_payment_internal(p_invoice_id uuid, p_source text, p_method text, p_reference text, p_received_at timestamp with time zone, p_gross numeric, p_fee numeric, p_net numeric, p_remittance uuid, p_reported text, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_inv       public.invoices%ROWTYPE;
  v_load      public.loads%ROWTYPE;
  v_received  numeric;
  v_status    public.invoice_status;
  v_payment   uuid;
BEGIN
  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % does not exist.', p_invoice_id USING ERRCODE = '22000';
  END IF;
  -- Second layer: when a user is signed in, only his own carrier's invoice.
  IF auth.uid() IS NOT NULL
     AND v_inv.company_id IS DISTINCT FROM public.current_company_id() THEN
    RAISE EXCEPTION 'Invoice not found.' USING ERRCODE = '42501';
  END IF;

  IF v_inv.status IN ('paid'::public.invoice_status,
                      'short_paid'::public.invoice_status,
                      'written_off'::public.invoice_status) THEN
    RAISE EXCEPTION 'Invoice % is already %; it takes no further payment.',
      v_inv.invoice_number, v_inv.status USING ERRCODE = '22000';
  END IF;

  IF round(p_net, 2) <> round(p_gross - p_fee, 2) THEN
    RAISE EXCEPTION 'Payment on % states net % but gross % less fee % is %.',
      v_inv.invoice_number, round(p_net,2), round(p_gross,2), round(p_fee,2),
      round(p_gross - p_fee, 2) USING ERRCODE = '22000';
  END IF;

  -- P70: payments_source_check admits 'factor', not 'factoring'.
  INSERT INTO public.payments (
    invoice_id, source, method, reference, received_at,
    gross_amount, fee_amount, net_deposited,
    remittance_id, reported_invoice_number, created_by, updated_by
  ) VALUES (
    p_invoice_id, CASE WHEN p_source = 'factoring' THEN 'factor' ELSE p_source END,
    p_method, p_reference, coalesce(p_received_at, now()),
    round(p_gross,2), round(p_fee,2), round(p_net,2),
    p_remittance, p_reported, p_actor, p_actor
  ) RETURNING id INTO v_payment;

  SELECT coalesce(sum(gross_amount), 0) INTO v_received
    FROM public.payments WHERE invoice_id = p_invoice_id;

  v_status := CASE WHEN round(v_received,2) >= round(v_inv.amount,2)
                   THEN 'paid'::public.invoice_status
                   ELSE 'partial'::public.invoice_status END;

  UPDATE public.invoices
     SET status       = v_status,
         purchased_at = CASE WHEN p_remittance IS NOT NULL AND purchased_at IS NULL
                             THEN coalesce(p_received_at, now()) ELSE purchased_at END,
         paid_at      = CASE WHEN v_status = 'paid'::public.invoice_status AND paid_at IS NULL
                             THEN coalesce(p_received_at, now()) ELSE paid_at END,
         updated_by   = p_actor
   WHERE id = p_invoice_id;

  IF v_status = 'paid'::public.invoice_status THEN
    SELECT * INTO v_load FROM public.loads WHERE id = v_inv.load_id;
    IF v_load.status IN ('invoiced'::public.load_status, 'factored'::public.load_status) THEN
      PERFORM public.update_load_status(v_inv.load_id, 'paid'::public.load_status,
        'Payment received: ' || coalesce(p_reference, p_source));
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'payment_id', v_payment,
    'invoice_id', p_invoice_id,
    'invoice_number', v_inv.invoice_number,
    'invoice_amount', round(v_inv.amount,2),
    'gross_amount', round(p_gross,2),
    'fee_amount', round(p_fee,2),
    'net_deposited', round(p_net,2),
    'received_total', round(v_received,2),
    'invoice_status', v_status
  );
END;
$function$;

-- Seed: the carrier selected by USDOT 2309365 (as 0048 did). The stamp trigger
-- admits an explicitly named company only for a service-role caller, so the
-- seed names itself as one for this transaction only.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

INSERT INTO public.billing_settings (company_id, remit_to_name, remit_to_address_1, remit_to_city,
  remit_to_state, remit_to_zip, remit_to_phone, remit_to_email, payment_terms_days)
SELECT id, 'SUPERTRANSPORT LLC', '605 Madison Street', 'Pleasant Hill', 'Missouri', '64080',
       '(816) 656-1279', 'marc@mysupertransport.com', 30
  FROM public.carrier_profile WHERE usdot_number = '2309365';

INSERT INTO public.factoring_companies (company_id, name, is_default, fee_pct, packet_style)
SELECT id, 'Smart Freight Funding', true, 2.00, 'combined'
  FROM public.carrier_profile WHERE usdot_number = '2309365';

SELECT set_config('request.jwt.claims', '', true);