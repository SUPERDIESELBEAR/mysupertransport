-- =====================================================================
-- MODULE 7, PASS 4 — payments, factoring lifecycle, remittance ingest.
-- =====================================================================

CREATE TABLE public.factoring_remittances (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL,
  source       text NOT NULL DEFAULT 'smart_freight_funding',
  reference    text NOT NULL,
  remittance_date date NOT NULL,
  net_amount   numeric(12,2) NOT NULL,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid,
  updated_by   uuid,
  CONSTRAINT factoring_remittances_reference_unique UNIQUE (company_id, source, reference),
  CONSTRAINT factoring_remittances_net_positive CHECK (net_amount > 0)
);

GRANT SELECT, INSERT, UPDATE ON public.factoring_remittances TO authenticated;
GRANT ALL ON public.factoring_remittances TO service_role;

ALTER TABLE public.factoring_remittances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "factoring_remittances management and owner only"
  ON public.factoring_remittances FOR ALL TO authenticated
  USING (company_id = public.current_company_id()
         AND (public.has_role(auth.uid(), 'management'::app_role)
              OR public.has_role(auth.uid(), 'owner'::app_role)))
  WITH CHECK (company_id = public.current_company_id()
         AND (public.has_role(auth.uid(), 'management'::app_role)
              OR public.has_role(auth.uid(), 'owner'::app_role)));

CREATE TRIGGER aa_stamp_billing_company_id
  BEFORE INSERT ON public.factoring_remittances
  FOR EACH ROW EXECUTE FUNCTION public.stamp_billing_company_id();

-- --------------------------------------------------------------- immutability
CREATE OR REPLACE FUNCTION public.enforce_remittance_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT public.invoice_writer_active() THEN
      RAISE EXCEPTION 'Remittance % is a recorded deposit and cannot be deleted.', OLD.reference
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF NOT public.invoice_writer_active() THEN
    IF NEW.company_id      IS DISTINCT FROM OLD.company_id
    OR NEW.source          IS DISTINCT FROM OLD.source
    OR NEW.reference       IS DISTINCT FROM OLD.reference
    OR NEW.remittance_date IS DISTINCT FROM OLD.remittance_date
    OR NEW.net_amount      IS DISTINCT FROM OLD.net_amount
    THEN
      RAISE EXCEPTION 'Remittance % is a recorded deposit; its reference, date and amount are immutable. Notes may still move.', OLD.reference
        USING ERRCODE = '42501';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_remittance_immutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_remittance_immutability() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_remittance_immutability() FROM authenticated;

CREATE TRIGGER enforce_remittance_immutability
  BEFORE UPDATE OR DELETE ON public.factoring_remittances
  FOR EACH ROW EXECUTE FUNCTION public.enforce_remittance_immutability();

-- ------------------------------------------------------------------- payments
ALTER TABLE public.payments
  ADD COLUMN remittance_id uuid REFERENCES public.factoring_remittances(id) ON DELETE RESTRICT,
  ADD COLUMN method text NOT NULL DEFAULT 'check',
  ADD COLUMN reported_invoice_number text,
  ADD CONSTRAINT payments_method_check CHECK (method IN ('check','ach','wire','other'));

CREATE INDEX idx_payments_remittance ON public.payments (remittance_id);
CREATE INDEX idx_payments_invoice ON public.payments (invoice_id);

COMMENT ON COLUMN public.payments.reported_invoice_number IS
  'The invoice number EXACTLY as the factor printed it. Matching normalises to digits; this keeps the raw form for dispute.';

CREATE OR REPLACE FUNCTION public.enforce_payment_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF NOT public.invoice_writer_active() THEN
    RAISE EXCEPTION 'A recorded payment is what landed in the bank; it cannot be % .', lower(TG_OP)
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_payment_immutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_payment_immutability() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_payment_immutability() FROM authenticated;

CREATE TRIGGER enforce_payment_immutability
  BEFORE UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_immutability();

-- ------------------------------------------------------- number normalisation
-- `ST26-0001`, `26-0001` and `260001` all reduce to `260001`. The leading year
-- keeps the digits unambiguous against Alvys's legacy 7-digit range.
CREATE OR REPLACE FUNCTION public.normalize_invoice_number(p_number text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'extensions'
AS $$ SELECT nullif(regexp_replace(coalesce(p_number, ''), '\D', '', 'g'), '') $$;

REVOKE ALL ON FUNCTION public.normalize_invoice_number(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalize_invoice_number(text) FROM anon;
REVOKE ALL ON FUNCTION public.normalize_invoice_number(text) FROM authenticated;

-- ------------------------------------------------------ shared posting helper
-- Posts ONE payment against ONE invoice and moves the invoice (and the load)
-- to whatever the RECEIVED TOTAL says it is. Fees arrive as facts.
CREATE OR REPLACE FUNCTION public.post_invoice_payment_internal(
  p_invoice_id  uuid,
  p_source      text,
  p_method      text,
  p_reference   text,
  p_received_at timestamptz,
  p_gross       numeric,
  p_fee         numeric,
  p_net         numeric,
  p_remittance  uuid,
  p_reported    text,
  p_actor       uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
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

  INSERT INTO public.payments (
    invoice_id, source, method, reference, received_at,
    gross_amount, fee_amount, reserve_amount, net_deposited,
    remittance_id, reported_invoice_number, created_by, updated_by
  ) VALUES (
    p_invoice_id, p_source, p_method, p_reference, coalesce(p_received_at, now()),
    round(p_gross,2), round(p_fee,2), 0, round(p_net,2),
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
$$;

REVOKE ALL ON FUNCTION public.post_invoice_payment_internal(uuid,text,text,text,timestamptz,numeric,numeric,numeric,uuid,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_invoice_payment_internal(uuid,text,text,text,timestamptz,numeric,numeric,numeric,uuid,text,uuid) FROM anon;
REVOKE ALL ON FUNCTION public.post_invoice_payment_internal(uuid,text,text,text,timestamptz,numeric,numeric,numeric,uuid,text,uuid) FROM authenticated;

-- ------------------------------------------------------------ remittance ingest
CREATE OR REPLACE FUNCTION public.record_factoring_remittance(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_actor      uuid := public.current_profile_id();
  v_actor_name text := public._audit_actor_name(public.current_profile_id());
  v_source     text := coalesce(nullif(p_payload->>'source',''), 'smart_freight_funding');
  v_reference  text := nullif(p_payload->>'reference','');
  v_date       date := (p_payload->>'remittance_date')::date;
  v_net        numeric := round(coalesce((p_payload->>'net_amount')::numeric, 0), 2);
  v_lines      jsonb := coalesce(p_payload->'lines', '[]'::jsonb);
  v_line       jsonb;
  v_sum        numeric;
  v_id         uuid;
  v_invoice    public.invoices%ROWTYPE;
  v_digits     text;
  v_hits       int;
  v_posted     jsonb := '[]'::jsonb;
  v_unmatched  jsonb := '[]'::jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'management'::app_role)
          OR public.has_role(auth.uid(), 'owner'::app_role)) THEN
    RAISE EXCEPTION 'Only management or owner may record a remittance.'
      USING ERRCODE = '42501';
  END IF;

  IF v_reference IS NULL OR v_date IS NULL OR v_net <= 0 THEN
    RAISE EXCEPTION 'A remittance needs a reference, a date and a positive net amount.'
      USING ERRCODE = '22000';
  END IF;

  IF EXISTS (SELECT 1 FROM public.factoring_remittances
              WHERE company_id = public.current_company_id()
                AND source = v_source AND reference = v_reference) THEN
    RAISE EXCEPTION 'Remittance % from % has already been recorded.', v_reference, v_source
      USING ERRCODE = '23505';
  END IF;

  -- The statement must add up as a statement, whether or not we can match it.
  SELECT coalesce(sum(round(net_amount,2)), 0) INTO v_sum
    FROM jsonb_to_recordset(v_lines) AS t(net_amount numeric);

  IF v_sum <> v_net THEN
    RAISE EXCEPTION 'Remittance % states net % but its lines total %.',
      v_reference, v_net, v_sum USING ERRCODE = '22000';
  END IF;

  INSERT INTO public.factoring_remittances (source, reference, remittance_date, net_amount,
                                            notes, created_by, updated_by)
  VALUES (v_source, v_reference, v_date, v_net, nullif(p_payload->>'notes',''), v_actor, v_actor)
  RETURNING id INTO v_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
  LOOP
    v_digits := public.normalize_invoice_number(v_line->>'invoice_number');

    SELECT count(*) INTO v_hits FROM public.invoices
     WHERE public.normalize_invoice_number(invoice_number) = v_digits;

    IF v_digits IS NULL OR v_hits <> 1 THEN
      -- NEVER guess at a near match. Hold the line for a human.
      v_unmatched := v_unmatched || jsonb_build_object(
        'invoice_number', v_line->>'invoice_number',
        'broker_reference', v_line->>'broker_reference',
        'gross_amount', (v_line->>'gross_amount')::numeric,
        'net_amount', (v_line->>'net_amount')::numeric,
        'reason', CASE WHEN v_digits IS NULL THEN 'no_invoice_number'
                       WHEN v_hits = 0 THEN 'no_match' ELSE 'ambiguous' END);
      CONTINUE;
    END IF;

    SELECT * INTO v_invoice FROM public.invoices
     WHERE public.normalize_invoice_number(invoice_number) = v_digits;

    v_posted := v_posted || public.post_invoice_payment_internal(
      v_invoice.id, 'factoring', coalesce(nullif(p_payload->>'method',''), 'check'),
      v_reference, v_date::timestamptz,
      round((v_line->>'gross_amount')::numeric, 2),
      round(coalesce((v_line->>'fee_amount')::numeric, 0), 2),
      round((v_line->>'net_amount')::numeric, 2),
      v_id, v_line->>'invoice_number', v_actor);
  END LOOP;

  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (v_actor, v_actor_name, 'remittance_recorded', 'factoring_remittances', v_id, v_reference,
          jsonb_build_object('source', v_source, 'net_amount', v_net,
                             'line_count', jsonb_array_length(v_lines),
                             'posted_count', jsonb_array_length(v_posted),
                             'unmatched_count', jsonb_array_length(v_unmatched)));

  RETURN jsonb_build_object(
    'remittance_id', v_id, 'reference', v_reference, 'net_amount', v_net,
    'posted', v_posted, 'unmatched', v_unmatched);
END;
$$;

REVOKE ALL ON FUNCTION public.record_factoring_remittance(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_factoring_remittance(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_factoring_remittance(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_factoring_remittance(jsonb) TO service_role;

-- ------------------------------------------------------- direct broker payment
CREATE OR REPLACE FUNCTION public.record_invoice_payment(p_invoice_id uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_actor      uuid := public.current_profile_id();
  v_actor_name text := public._audit_actor_name(public.current_profile_id());
  v_result     jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'management'::app_role)
          OR public.has_role(auth.uid(), 'owner'::app_role)) THEN
    RAISE EXCEPTION 'Only management or owner may record a payment.'
      USING ERRCODE = '42501';
  END IF;

  v_result := public.post_invoice_payment_internal(
    p_invoice_id,
    coalesce(nullif(p_payload->>'source',''), 'broker_direct'),
    coalesce(nullif(p_payload->>'method',''), 'check'),
    nullif(p_payload->>'reference',''),
    coalesce((p_payload->>'received_at')::timestamptz, now()),
    round(coalesce((p_payload->>'gross_amount')::numeric, 0), 2),
    round(coalesce((p_payload->>'fee_amount')::numeric, 0), 2),
    round(coalesce((p_payload->>'net_deposited')::numeric, 0), 2),
    NULL, NULL, v_actor);

  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (v_actor, v_actor_name, 'payment_recorded', 'invoices', p_invoice_id,
          v_result->>'invoice_number', v_result);

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.record_invoice_payment(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_invoice_payment(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(uuid, jsonb) TO service_role;

-- --------------------------------------------------------------- the short pay
CREATE OR REPLACE FUNCTION public.close_short_paid_invoice(p_invoice_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_actor      uuid := public.current_profile_id();
  v_actor_name text := public._audit_actor_name(public.current_profile_id());
  v_inv        public.invoices%ROWTYPE;
  v_received   numeric;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'management'::app_role)
          OR public.has_role(auth.uid(), 'owner'::app_role)) THEN
    RAISE EXCEPTION 'Only management or owner may close a short-paid invoice.'
      USING ERRCODE = '42501';
  END IF;

  IF nullif(btrim(coalesce(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A short pay closes only with a written reason.' USING ERRCODE = '22000';
  END IF;

  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % does not exist.', p_invoice_id USING ERRCODE = '22000';
  END IF;

  IF v_inv.status <> 'partial'::public.invoice_status THEN
    RAISE EXCEPTION 'Invoice % is %, not partial; there is no short pay to close.',
      v_inv.invoice_number, v_inv.status USING ERRCODE = '22000';
  END IF;

  SELECT coalesce(sum(gross_amount),0) INTO v_received
    FROM public.payments WHERE invoice_id = p_invoice_id;

  UPDATE public.invoices
     SET status = 'short_paid'::public.invoice_status,
         short_pay_reason = btrim(p_reason),
         paid_at = coalesce(paid_at, now()),
         reconciled_at = now(),
         updated_by = v_actor
   WHERE id = p_invoice_id;

  IF EXISTS (SELECT 1 FROM public.loads
              WHERE id = v_inv.load_id
                AND status IN ('invoiced'::public.load_status, 'factored'::public.load_status)) THEN
    PERFORM public.update_load_status(v_inv.load_id, 'paid'::public.load_status,
      'Short pay accepted: ' || btrim(p_reason));
  END IF;

  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (v_actor, v_actor_name, 'invoice_short_paid', 'invoices', p_invoice_id, v_inv.invoice_number,
          jsonb_build_object('invoice_amount', v_inv.amount, 'received', v_received,
                             'shortfall', round(v_inv.amount - v_received, 2),
                             'reason', btrim(p_reason)));

  RETURN jsonb_build_object('invoice_id', p_invoice_id, 'invoice_number', v_inv.invoice_number,
                            'status', 'short_paid', 'received', round(v_received,2),
                            'shortfall', round(v_inv.amount - v_received, 2));
END;
$$;

REVOKE ALL ON FUNCTION public.close_short_paid_invoice(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_short_paid_invoice(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.close_short_paid_invoice(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_short_paid_invoice(uuid, text) TO service_role;

COMMENT ON TABLE public.factoring_remittances IS
  'One factor check funding many invoices. The fee on each line is RECORDED FROM THE STATEMENT, never recomputed from dispatch_settlement_rates.factoring_pct.';
