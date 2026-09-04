-- ===========================================================================
-- MODULE 7 (Billing & Invoicing), PASS 3 — persistence, numbering, queue.
-- ===========================================================================

-- ---------------------------------------------------------------- numbering
-- Shaped after public.load_number_config, with ONE DIFFERENCE that is
-- deliberate: the YEAR IS PART OF THE KEY. load_number_config carries a
-- current_year column and branches in code on rollover; here the rollover is
-- a new row, so the 2027 sequence cannot be produced by a code path that
-- forgot to reset. Four digits caps a year at 9,999 invoices — stated as a
-- known limit, and the allocator refuses loudly rather than wrapping.
CREATE TABLE public.invoice_number_config (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.carrier_profile(id) ON DELETE RESTRICT,
  year             integer NOT NULL,
  prefix           text NOT NULL DEFAULT 'ST',
  separator        text NOT NULL DEFAULT '-',
  sequence_padding integer NOT NULL DEFAULT 4 CHECK (sequence_padding BETWEEN 1 AND 8),
  next_sequence    integer NOT NULL DEFAULT 1 CHECK (next_sequence >= 1),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, year)
);

COMMENT ON TABLE public.invoice_number_config IS
  'One row per calendar year per company. Invoice numbers are ST + YY + separator + '
  'zero-padded sequence (ST26-0001). The year is part of the KEY so the annual restart '
  'is data, not code. Only public.allocate_invoice_number() may advance next_sequence, '
  'and it is called ONLY from public.create_invoice() on successful persistence — never '
  'from a form mount, which is the defect that burned 52 of 63 load numbers.';

GRANT SELECT ON public.invoice_number_config TO authenticated;
GRANT ALL ON public.invoice_number_config TO service_role;

ALTER TABLE public.invoice_number_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Management and owner read invoice numbering"
  ON public.invoice_number_config FOR SELECT TO authenticated
  USING (
    company_id = public.current_company_id()
    AND (public.has_role(auth.uid(), 'management'::app_role)
         OR public.has_role(auth.uid(), 'owner'::app_role))
  );

CREATE TRIGGER aa_stamp_billing_company_id
  BEFORE INSERT ON public.invoice_number_config
  FOR EACH ROW EXECUTE FUNCTION public.stamp_billing_company_id();

-- ---------------------------------------------------------------------------
-- The allocator. Not reachable by any client role: a number is consumed by a
-- WRITE, and the only thing that writes is create_invoice().
CREATE OR REPLACE FUNCTION public.allocate_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_company uuid := public.current_company_id();
  v_year    int  := EXTRACT(YEAR FROM (now() AT TIME ZONE 'America/Chicago'))::int;
  v_cfg     public.invoice_number_config%ROWTYPE;
  v_seq     int;
BEGIN
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'No carrier company is configured; an invoice number cannot be allocated.'
      USING ERRCODE = '22000';
  END IF;

  SELECT * INTO v_cfg
    FROM public.invoice_number_config
   WHERE company_id = v_company AND year = v_year
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.invoice_number_config (company_id, year)
    VALUES (v_company, v_year)
    RETURNING * INTO v_cfg;
  END IF;

  v_seq := v_cfg.next_sequence;

  IF v_seq > (10 ^ v_cfg.sequence_padding)::int - 1 THEN
    RAISE EXCEPTION 'Invoice sequence for % is exhausted at % digits (max %). Widen sequence_padding before invoicing again.',
      v_year, v_cfg.sequence_padding, (10 ^ v_cfg.sequence_padding)::int - 1
      USING ERRCODE = '22003';
  END IF;

  UPDATE public.invoice_number_config
     SET next_sequence = v_seq + 1, updated_at = now()
   WHERE id = v_cfg.id;

  RETURN v_cfg.prefix
       || to_char(make_date(v_year, 1, 1), 'YY')
       || v_cfg.separator
       || lpad(v_seq::text, v_cfg.sequence_padding, '0');
END;
$function$;

REVOKE ALL ON FUNCTION public.allocate_invoice_number() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.allocate_invoice_number() FROM anon;
REVOKE ALL ON FUNCTION public.allocate_invoice_number() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_invoice_number() TO service_role;

-- ---------------------------------------------------------------------------
-- THE ONE WRITER.
--
-- The client computes with the Pass 2 pure builder; this VALIDATES, exactly as
-- compute_dispatch_settlement does, so section 4 exists in one language. A
-- guard may REFUSE. It may never PRODUCE a figure — with one exception that is
-- not a figure at all: the billing path, which is a fact about the broker and
-- is therefore read here and refused if the payload disagrees.
CREATE OR REPLACE FUNCTION public.create_invoice(p_load_id uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_actor      uuid := public.current_profile_id();
  v_actor_name text := public._audit_actor_name(public.current_profile_id());
  v_load       public.loads%ROWTYPE;
  v_broker     public.brokers%ROWTYPE;
  v_amount     numeric := coalesce((p_payload->>'amount')::numeric, 0);
  v_sum        numeric;
  v_path       public.invoice_billing_path;
  v_claimed    text := nullif(p_payload->>'billing_path', '');
  v_number     text;
  v_id         uuid;
  v_missing    text;
  v_extra      text;
  v_line       jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'management'::app_role)
          OR public.has_role(auth.uid(), 'owner'::app_role)) THEN
    RAISE EXCEPTION 'Only management or owner may create an invoice.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_load FROM public.loads WHERE id = p_load_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Load % does not exist.', p_load_id USING ERRCODE = '22000';
  END IF;

  IF v_load.status <> 'ready_to_invoice'::load_status THEN
    RAISE EXCEPTION 'Load % is %, not ready_to_invoice; it cannot be invoiced.',
      v_load.load_number, v_load.status USING ERRCODE = '22000';
  END IF;

  IF EXISTS (SELECT 1 FROM public.invoices WHERE load_id = p_load_id) THEN
    RAISE EXCEPTION 'Load % already has invoice %.', v_load.load_number,
      (SELECT invoice_number FROM public.invoices WHERE load_id = p_load_id)
      USING ERRCODE = '23505';
  END IF;

  -- ------------------------------------------------ the lines equal the total
  SELECT coalesce(sum(amount), 0) INTO v_sum
    FROM jsonb_to_recordset(coalesce(p_payload->'lines', '[]'::jsonb))
         AS t(line_type text, amount numeric);

  IF round(v_sum, 2) <> round(v_amount, 2) THEN
    RAISE EXCEPTION 'Invoice lines sum to % but the payload states %.',
      round(v_sum, 2), round(v_amount, 2) USING ERRCODE = '22000';
  END IF;

  -- ------------------------------------------ the charges, in BOTH directions
  -- One-directional would let a caller quietly drop an expensive accessorial
  -- and still produce a self-consistent invoice.
  SELECT string_agg(c.charge_type || ' ' || c.amount::text, ', ') INTO v_missing
    FROM public.load_charges c
   WHERE c.load_id = p_load_id
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_to_recordset(coalesce(p_payload->'lines', '[]'::jsonb))
                     AS l(load_charge_id uuid)
        WHERE l.load_charge_id = c.id);

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Invoice for % omits charge(s) the load carries: %.',
      v_load.load_number, v_missing USING ERRCODE = '22000';
  END IF;

  SELECT string_agg(coalesce(l.load_charge_id::text, '(null)'), ', ') INTO v_extra
    FROM jsonb_to_recordset(coalesce(p_payload->'lines', '[]'::jsonb))
         AS l(line_type text, load_charge_id uuid)
   WHERE l.line_type = 'charge'
     AND (l.load_charge_id IS NULL
          OR NOT EXISTS (SELECT 1 FROM public.load_charges c
                          WHERE c.id = l.load_charge_id AND c.load_id = p_load_id));

  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION 'Invoice for % bills charge(s) the load does not carry: %.',
      v_load.load_number, v_extra USING ERRCODE = '22000';
  END IF;

  -- --------------------------------------------------------- the billing path
  -- Frozen from the broker's factoring status AT BUILD TIME. Anything other
  -- than an approved broker bills direct, and that must be VISIBLE.
  IF v_load.broker_id IS NOT NULL THEN
    SELECT * INTO v_broker FROM public.brokers WHERE id = v_load.broker_id;
  END IF;

  v_path := CASE
    WHEN v_broker.id IS NOT NULL AND v_broker.factoring_status = 'approved'::broker_factoring_status
      THEN 'factored'::invoice_billing_path
    ELSE 'direct'::invoice_billing_path
  END;

  IF v_claimed IS NOT NULL AND v_claimed <> v_path::text THEN
    RAISE EXCEPTION 'Payload asks to bill % but broker factoring status % forces %.',
      v_claimed, coalesce(v_broker.factoring_status::text, 'no broker'), v_path
      USING ERRCODE = '22000';
  END IF;

  -- ------------------------------------------------------------- allocate NOW
  -- After every refusal, immediately before the row exists. A number consumed
  -- earlier than this is a number burned on an invoice that was never written.
  v_number := public.allocate_invoice_number();

  INSERT INTO public.invoices (
    load_id, broker_id, broker_name_snapshot, broker_billing_email_snapshot,
    invoice_number, billing_path, amount, status, created_by, updated_by
  ) VALUES (
    p_load_id, v_load.broker_id, v_broker.company_name, v_broker.billing_email,
    v_number, v_path, round(v_amount, 2), 'open'::invoice_status, v_actor, v_actor
  )
  RETURNING id INTO v_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(coalesce(p_payload->'lines', '[]'::jsonb))
  LOOP
    INSERT INTO public.invoice_line_items (
      invoice_id, line_type, description, amount, load_charge_id, charge_type, created_by
    ) VALUES (
      v_id,
      v_line->>'line_type',
      nullif(v_line->>'description', ''),
      round(coalesce((v_line->>'amount')::numeric, 0), 2),
      nullif(v_line->>'load_charge_id', '')::uuid,
      nullif(v_line->>'charge_type', ''),
      v_actor
    );
  END LOOP;

  -- The existing status path, not a new transition and not a bare UPDATE:
  -- ready_to_invoice → invoiced is a forward step and needs no note.
  PERFORM public.update_load_status(p_load_id, 'invoiced'::load_status, NULL);

  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (v_actor, v_actor_name, 'invoice_created', 'invoices', v_id, v_number,
          jsonb_build_object(
            'load_id', p_load_id,
            'load_number', v_load.load_number,
            'amount', round(v_amount, 2),
            'billing_path', v_path,
            'broker_factoring_status', coalesce(v_broker.factoring_status::text, 'no broker'),
            'line_count', jsonb_array_length(coalesce(p_payload->'lines', '[]'::jsonb))
          ));

  RETURN jsonb_build_object(
    'invoice_id', v_id,
    'invoice_number', v_number,
    'billing_path', v_path,
    'amount', round(v_amount, 2),
    'load_number', v_load.load_number
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_invoice(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_invoice(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_invoice(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice(uuid, jsonb) TO service_role;