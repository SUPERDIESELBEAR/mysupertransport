-- Module 7 Pass 4 completion.
-- 1. There is no reserve. Confirmed with the owner and confirmed by arithmetic
--    on every row of Smart Freight check 764176: net is gross less fee, full
--    stop. An always-zero column reads as "not yet tracked", which is a lie.
CREATE OR REPLACE FUNCTION public.post_invoice_payment_internal(
  p_invoice_id uuid, p_source text, p_method text, p_reference text,
  p_received_at timestamptz, p_gross numeric, p_fee numeric, p_net numeric,
  p_remittance uuid, p_reported text, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $fn$
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
$fn$;

REVOKE ALL ON FUNCTION public.post_invoice_payment_internal(uuid, text, text, text, timestamptz, numeric, numeric, numeric, uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_invoice_payment_internal(uuid, text, text, text, timestamptz, numeric, numeric, numeric, uuid, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.post_invoice_payment_internal(uuid, text, text, text, timestamptz, numeric, numeric, numeric, uuid, text, uuid) FROM authenticated;

ALTER TABLE public.payments DROP COLUMN IF EXISTS reserve_amount;

-- 2. A short pay closes a balance ONLY with a recorded reason and actor.
CREATE OR REPLACE FUNCTION public.close_short_paid_invoice(
  p_invoice_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $fn$
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
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % does not exist.', p_invoice_id USING ERRCODE = '22000';
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
$fn$;

REVOKE ALL ON FUNCTION public.close_short_paid_invoice(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_short_paid_invoice(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.close_short_paid_invoice(uuid, text) TO authenticated;