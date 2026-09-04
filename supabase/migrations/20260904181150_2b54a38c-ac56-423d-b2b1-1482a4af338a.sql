-- The net identity check was defined over reserve_amount and was dropped with
-- that column. Net is gross less fee, full stop — restate it without reserve.
ALTER TABLE public.payments
  ADD CONSTRAINT payments_net_identity_check
  CHECK (round(net_deposited, 2) = round(gross_amount - fee_amount, 2));

COMMENT ON CONSTRAINT payments_net_identity_check ON public.payments IS
  'Smart Freight holds NO reserve: net is gross less fee and nothing else. Confirmed by arithmetic across every row of check 764176 (2026-09-04).';

-- record_invoice_payment defaulted source to broker_direct, which
-- payments_source_check does not permit. The accepted value is broker.
CREATE OR REPLACE FUNCTION public.record_invoice_payment(
  p_invoice_id uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $fn$
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
$fn$;

REVOKE ALL ON FUNCTION public.record_invoice_payment(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_invoice_payment(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(uuid, jsonb) TO authenticated;