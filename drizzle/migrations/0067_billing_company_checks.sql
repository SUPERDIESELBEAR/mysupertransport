-- Alvys M2 pass 1: billing functions check the caller's company; dispatchers may issue invoices (P22, P33).
-- Grants unchanged (CREATE OR REPLACE keeps ACLs); search_path pins unchanged.

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
          OR public.has_role(auth.uid(), 'owner'::app_role)
          OR public.has_role(auth.uid(), 'dispatcher'::app_role)) THEN
    RAISE EXCEPTION 'Only a dispatcher, management or owner may create an invoice.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_load FROM public.loads WHERE id = p_load_id FOR UPDATE;
  IF NOT FOUND OR v_load.company_id IS DISTINCT FROM public.current_company_id() THEN
    RAISE EXCEPTION 'Load not found.' USING ERRCODE = '42501';
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
    IF NOT FOUND OR v_broker.company_id IS DISTINCT FROM public.current_company_id() THEN
      RAISE EXCEPTION 'Load not found.' USING ERRCODE = '42501';
    END IF;
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
  -- P22/P33: a dispatcher may ISSUE. The ready_to_invoice -> invoiced step is
  -- admitted for him only on this path, through a transaction-local flag the
  -- browser cannot set (set_config is not exposed to the Data API).
  PERFORM set_config('superdrive.invoice_issue', 'on', true);
  PERFORM public.update_load_status(p_load_id, 'invoiced'::load_status, NULL);
  PERFORM set_config('superdrive.invoice_issue', '', true);

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

CREATE OR REPLACE FUNCTION public.update_load_status(p_load_id uuid, p_new_status load_status, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_current load_status;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_seq load_status[] := ARRAY[
    'available','covered','dispatched','in_transit','at_delivery','delivered',
    'pod_received','accessorials_approved','ready_to_invoice','invoiced',
    'factored','paid','settled','closed'
  ]::load_status[];
  v_billing load_status[] := ARRAY['invoiced','factored','paid','settled']::load_status[];
  v_is_mgmt boolean;
  v_is_disp boolean;
  v_from int;
  v_to int;
  v_requires_note boolean := false;
  v_hist_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_is_mgmt := public.has_role(v_uid, 'management') OR public.has_role(v_uid, 'owner');
  v_is_disp := public.has_role(v_uid, 'dispatcher');

  IF NOT (v_is_mgmt OR v_is_disp) THEN
    RAISE EXCEPTION 'You do not have permission to change load status';
  END IF;

  IF p_new_status = ANY(v_billing) AND NOT v_is_mgmt
     AND NOT (p_new_status = 'invoiced'::load_status
              AND coalesce(current_setting('superdrive.invoice_issue', true), '') = 'on') THEN
    RAISE EXCEPTION 'Billing status changes require management access';
  END IF;

  SELECT status INTO v_current FROM public.loads WHERE id = p_load_id;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'Load not found';
  END IF;

  IF v_current = p_new_status THEN
    RAISE EXCEPTION 'Load is already in that status';
  END IF;

  v_from := array_position(v_seq, v_current);
  v_to := array_position(v_seq, p_new_status);

  IF p_new_status IN ('tonu','cancelled') THEN
    v_requires_note := true;
  ELSIF p_new_status IN ('paid','settled') THEN
    v_requires_note := true;
  ELSIF v_from IS NULL OR v_to IS NULL THEN
    v_requires_note := true;
  ELSIF v_to < v_from THEN
    v_requires_note := true;
  ELSIF v_to > v_from + 1
        AND NOT (v_current = 'invoiced' AND p_new_status = 'paid') THEN
    v_requires_note := true;
  END IF;

  IF v_requires_note AND v_note IS NULL THEN
    RAISE EXCEPTION 'A note is required for this status change';
  END IF;

  PERFORM set_config('superdrive.status_change_source', 'staff_screen', true);
  UPDATE public.loads SET status = p_new_status WHERE id = p_load_id;
  PERFORM set_config('superdrive.status_change_source', '', true);

  SELECT id INTO v_hist_id
  FROM public.load_status_history
  WHERE load_id = p_load_id
  ORDER BY changed_at DESC, created_at DESC
  LIMIT 1;

  IF v_hist_id IS NOT NULL AND v_note IS NOT NULL THEN
    UPDATE public.load_status_history SET notes = v_note WHERE id = v_hist_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_invoice_payment(p_invoice_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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

  IF NOT EXISTS (SELECT 1 FROM public.invoices
                  WHERE id = p_invoice_id AND company_id = public.current_company_id()) THEN
    RAISE EXCEPTION 'Invoice not found.' USING ERRCODE = '42501';
  END IF;

  v_result := public.post_invoice_payment_internal(
    p_invoice_id,
    coalesce(nullif(p_payload->>'source',''), 'broker'),
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
$function$;

CREATE OR REPLACE FUNCTION public.close_short_paid_invoice(p_invoice_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_actor      uuid := public.current_profile_id();
  v_actor_name text := public._audit_actor_name(public.current_profile_id());
  v_inv        public.invoices%ROWTYPE;
  v_received   numeric;
  v_result     jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'management'::app_role)
          OR public.has_role(auth.uid(), 'owner'::app_role)) THEN
    RAISE EXCEPTION 'Only management or owner may close a short-paid invoice.'
      USING ERRCODE = '42501';
  END IF;

  IF coalesce(length(btrim(p_reason)), 0) < 10 THEN
    RAISE EXCEPTION 'A short pay closes only with a written reason of at least 10 characters.'
      USING ERRCODE = '22000';
  END IF;

  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND OR v_inv.company_id IS DISTINCT FROM public.current_company_id() THEN
    RAISE EXCEPTION 'Invoice not found.' USING ERRCODE = '42501';
  END IF;

  IF v_inv.status <> 'partial'::public.invoice_status THEN
    RAISE EXCEPTION 'Invoice % is %, not partial; only a partly paid invoice is short-pay closed.',
      v_inv.invoice_number, v_inv.status USING ERRCODE = '22000';
  END IF;

  SELECT coalesce(sum(gross_amount), 0) INTO v_received
    FROM public.payments WHERE invoice_id = p_invoice_id;

  IF v_received <= 0 THEN
    RAISE EXCEPTION 'Invoice % has taken no payment at all; it is unpaid, not short paid.',
      v_inv.invoice_number USING ERRCODE = '22000';
  END IF;

  UPDATE public.invoices
     SET status          = 'short_paid'::public.invoice_status,
         short_pay_reason = btrim(p_reason),
         paid_at         = coalesce(paid_at, now()),
         paid_by         = coalesce(paid_by, v_actor),
         reconciled_at   = now(),
         reconciled_by   = v_actor,
         updated_by      = v_actor
   WHERE id = p_invoice_id;

  v_result := jsonb_build_object(
    'invoice_id', p_invoice_id,
    'invoice_number', v_inv.invoice_number,
    'invoice_amount', round(v_inv.amount, 2),
    'received_total', round(v_received, 2),
    'shortfall', round(v_inv.amount - v_received, 2),
    'reason', btrim(p_reason),
    'invoice_status', 'short_paid');

  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (v_actor, v_actor_name, 'invoice_short_pay_closed', 'invoices', p_invoice_id,
          v_inv.invoice_number, v_result);

  RETURN v_result;
END;
$function$;

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

  INSERT INTO public.payments (
    invoice_id, source, method, reference, received_at,
    gross_amount, fee_amount, net_deposited,
    remittance_id, reported_invoice_number, created_by, updated_by
  ) VALUES (
    p_invoice_id, p_source, p_method, p_reference, coalesce(p_received_at, now()),
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

CREATE OR REPLACE FUNCTION public.record_factoring_remittance(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
     WHERE company_id = public.current_company_id()
       AND public.normalize_invoice_number(invoice_number) = v_digits;

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
     WHERE company_id = public.current_company_id()
       AND public.normalize_invoice_number(invoice_number) = v_digits;

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
$function$;

CREATE OR REPLACE FUNCTION public.create_accessorial_adjustment(p_load_id uuid, p_charge_type text, p_amount numeric, p_reason text, p_description text DEFAULT NULL::text, p_funding_source text DEFAULT NULL::text, p_actual_cost numeric DEFAULT NULL::numeric, p_proof_document_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid          uuid := auth.uid();
  v_actor        uuid := public.current_profile_id();
  v_reason       text := nullif(btrim(coalesce(p_reason, '')), '');
  v_load_number  text;
  v_company      uuid;
  v_class        text;
  v_policy       jsonb;
  v_seq          integer;
  v_reference    text;
  v_billing      text;
  v_id           uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'management'::app_role)
          OR public.has_role(v_uid, 'owner'::app_role)
          OR public.has_role(v_uid, 'dispatcher'::app_role)) THEN
    RAISE EXCEPTION 'Only a dispatcher, management or owner may record a late accessorial.'
      USING ERRCODE = '42501';
  END IF;

  -- The load must exist. Its STATUS is deliberately not checked: this path
  -- exists precisely for loads whose money assert_charge_entry_allowed freezes.
  -- Its COMPANY is read here and is the authority for the rate sheet below.
  SELECT load_number, company_id INTO v_load_number, v_company
    FROM public.loads WHERE id = p_load_id;
  IF v_load_number IS NULL THEN
    RAISE EXCEPTION 'Load not found' USING ERRCODE = '23503';
  END IF;
  IF v_company IS DISTINCT FROM public.current_company_id() THEN
    RAISE EXCEPTION 'Load not found.' USING ERRCODE = '42501';
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A late accessorial needs a written reason.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'A late accessorial needs an amount greater than zero.';
  END IF;

  -- Classification, through the SAME gate load_charges uses.
  PERFORM public.assert_known_charge_type(p_charge_type);

  -- ...and it must be one the pay policy in force can actually price, or the
  -- adjustment could be approved and then reach a settlement with no rate.
  -- THE LOAD'S OWN CARRIER's rate sheet, never an arbitrary one.
  SELECT p.charge_pay_classes INTO v_policy
    FROM public.company_pay_policy_on(v_company, (now() AT TIME ZONE 'America/Chicago')::date) p;
  IF v_policy IS NULL THEN
    RAISE EXCEPTION 'No active company-default pay policy; a late accessorial cannot be priced.';
  END IF;
  v_class := v_policy ->> p_charge_type;
  IF v_class IS NULL THEN
    RAISE EXCEPTION 'The pay policy in force cannot price a % charge.', p_charge_type;
  END IF;

  IF p_proof_document_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.load_documents
                      WHERE id = p_proof_document_id AND load_id = p_load_id) THEN
    RAISE EXCEPTION 'That proof document does not belong to this load.';
  END IF;

  -- Serialise sequence allocation per load. UNIQUE (load_id, sequence) is the
  -- backstop if two sessions ever slip past this lock.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('accessorial_adjustments:' || p_load_id::text, 0));

  SELECT coalesce(max(sequence), 0) + 1 INTO v_seq
    FROM public.accessorial_adjustments WHERE load_id = p_load_id;
  v_reference := v_load_number || '-A' || v_seq::text;

  -- Billing state is a FACT about the original invoice, read here, never taken
  -- from the caller. Submitted means the factor already has it.
  SELECT CASE WHEN i.submitted_at IS NOT NULL
              THEN 'pending_supplemental' ELSE 'not_required' END
    INTO v_billing
    FROM public.invoices i WHERE i.load_id = p_load_id;
  v_billing := coalesce(v_billing, 'not_required');

  INSERT INTO public.accessorial_adjustments (
    load_id, reference, sequence, charge_type, description, amount,
    funding_source, actual_cost, proof_document_id,
    status, reason, billing_state, created_by, updated_by
  ) VALUES (
    p_load_id, v_reference, v_seq, p_charge_type,
    nullif(btrim(coalesce(p_description, '')), ''), p_amount,
    nullif(p_funding_source, ''), p_actual_cost, p_proof_document_id,
    'draft', v_reason, v_billing, v_actor, v_actor
  ) RETURNING id INTO v_id;

  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (v_actor, public._audit_actor_name(v_uid), 'accessorial_adjustment_created',
          'accessorial_adjustment', v_id, v_reference,
          jsonb_build_object('load_id', p_load_id, 'charge_type', p_charge_type,
                             'amount', p_amount, 'billing_state', v_billing,
                             'reason', v_reason));
  RETURN v_id;
END;
$function$;