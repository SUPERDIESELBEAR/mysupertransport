ALTER TABLE public.billing_settings
  ADD COLUMN logo_storage_path text,
  ADD COLUMN accent_color text NOT NULL DEFAULT '#C9A84C',
  ADD COLUMN footer_note text,
  ADD COLUMN show_po_number boolean NOT NULL DEFAULT true,
  ADD COLUMN show_mc_usdot boolean NOT NULL DEFAULT true,
  ADD COLUMN show_order_date boolean NOT NULL DEFAULT true,
  ADD COLUMN show_pickup_date boolean NOT NULL DEFAULT true;

ALTER TABLE public.factoring_companies
  ADD COLUMN packet_includes jsonb NOT NULL DEFAULT '{"invoice":true,"bol":true,"pod":true,"rate_confirmation":true,"revised_rate_confirmation":true,"lumper_receipt":true,"scale_ticket":true,"detention_documentation":true,"loadout_pickup_inspection":true,"loadout_delivery_inspection":true,"permit":true,"broker_correspondence":false,"reimbursement_proof":false,"other":false}'::jsonb;

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
  IF NEW.accent_color !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'Accent color must be a six-digit hex color.' USING ERRCODE = '22000';
  END IF;
  NEW.accent_color := upper(NEW.accent_color);
  IF length(coalesce(NEW.footer_note, '')) > 240 THEN
    RAISE EXCEPTION 'Footer note can hold at most 240 characters.' USING ERRCODE = '22000';
  END IF;
  IF NEW.logo_storage_path IS NOT NULL
     AND NEW.logo_storage_path !~ ('^' || NEW.company_id::text || '/logo\.(png|jpg|jpeg)$') THEN
    RAISE EXCEPTION 'Logo path is not valid for this company.' USING ERRCODE = '22000';
  END IF;
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN NEW.updated_by := coalesce(auth.uid(), NEW.updated_by); END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_billing_settings() FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.validate_factoring_company()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_e text;
  v_seen text[] := '{}';
  v_allowed text[];
  v_key text;
BEGIN
  NEW.name := btrim(NEW.name);
  NEW.send_to_emails := public.normalize_billing_email_list(NEW.send_to_emails, 'Send-to');
  NEW.cc_emails := public.normalize_billing_email_list(NEW.cc_emails, 'CC');
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
  IF jsonb_typeof(NEW.packet_includes) <> 'object' THEN
    RAISE EXCEPTION 'Packet includes must be an object.' USING ERRCODE = '22000';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(NEW.packet_includes) LOOP
    IF NOT (v_key = ANY(v_allowed)) OR jsonb_typeof(NEW.packet_includes->v_key) <> 'boolean' THEN
      RAISE EXCEPTION 'Packet include "%" is invalid.', v_key USING ERRCODE = '22000';
    END IF;
  END LOOP;
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN NEW.updated_by := coalesce(auth.uid(), NEW.updated_by); END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_factoring_company() FROM PUBLIC, anon;

CREATE POLICY carrier_branding_same_company_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'carrier-branding'
    AND (storage.foldername(name))[1] = (SELECT public.current_company_id())::text
    AND ((SELECT public.has_role(auth.uid(),'dispatcher')) OR (SELECT public.has_role(auth.uid(),'management')) OR (SELECT public.has_role(auth.uid(),'owner'))));
CREATE POLICY carrier_branding_management_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'carrier-branding'
    AND (storage.foldername(name))[1] = (SELECT public.current_company_id())::text
    AND ((SELECT public.has_role(auth.uid(),'management')) OR (SELECT public.has_role(auth.uid(),'owner'))));
CREATE POLICY carrier_branding_management_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'carrier-branding'
    AND (storage.foldername(name))[1] = (SELECT public.current_company_id())::text
    AND ((SELECT public.has_role(auth.uid(),'management')) OR (SELECT public.has_role(auth.uid(),'owner'))))
  WITH CHECK (bucket_id = 'carrier-branding'
    AND (storage.foldername(name))[1] = (SELECT public.current_company_id())::text
    AND ((SELECT public.has_role(auth.uid(),'management')) OR (SELECT public.has_role(auth.uid(),'owner'))));
CREATE POLICY carrier_branding_management_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'carrier-branding'
    AND (storage.foldername(name))[1] = (SELECT public.current_company_id())::text
    AND ((SELECT public.has_role(auth.uid(),'management')) OR (SELECT public.has_role(auth.uid(),'owner'))));

CREATE OR REPLACE FUNCTION public.invoice_readiness_missing(p_load_id uuid)
RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_load public.loads%ROWTYPE;
  v_broker public.brokers%ROWTYPE;
  v_missing text[] := '{}';
  v_slot record;
BEGIN
  SELECT * INTO v_load FROM public.loads WHERE id = p_load_id;
  IF NOT FOUND OR v_load.company_id IS DISTINCT FROM public.current_company_id() THEN
    RAISE EXCEPTION 'Load not found.' USING ERRCODE = '42501';
  END IF;

  IF v_load.load_type = 'loadout'::public.load_type THEN
    FOR v_slot IN SELECT * FROM (VALUES
      ('loadout_pickup_inspection'::public.load_document_type,'Front','Pickup inspection — Front'),
      ('loadout_pickup_inspection'::public.load_document_type,'Driver Side','Pickup inspection — Driver Side'),
      ('loadout_pickup_inspection'::public.load_document_type,'Passenger Side','Pickup inspection — Passenger Side'),
      ('loadout_pickup_inspection'::public.load_document_type,'Rear Doors Closed','Pickup inspection — Rear Doors Closed'),
      ('loadout_pickup_inspection'::public.load_document_type,'Rear Doors Open','Pickup inspection — Roof check — doors open'),
      ('loadout_pickup_inspection'::public.load_document_type,'Trailer Number Plate','Pickup inspection — Trailer Number Plate'),
      ('loadout_pickup_inspection'::public.load_document_type,'VIN Plate','Pickup inspection — VIN Plate'),
      ('loadout_pickup_inspection'::public.load_document_type,'Tires and Wheels','Pickup inspection — Tires and Wheels'),
      ('loadout_pickup_inspection'::public.load_document_type,'Annual Inspection Sticker','Pickup inspection — Annual Inspection Sticker'),
      ('loadout_delivery_inspection'::public.load_document_type,'Front','Delivery inspection — Front'),
      ('loadout_delivery_inspection'::public.load_document_type,'Driver Side','Delivery inspection — Driver Side'),
      ('loadout_delivery_inspection'::public.load_document_type,'Passenger Side','Delivery inspection — Passenger Side'),
      ('loadout_delivery_inspection'::public.load_document_type,'Rear Doors Closed','Delivery inspection — Rear Doors Closed'),
      ('loadout_delivery_inspection'::public.load_document_type,'Trailer Number Plate','Delivery inspection — Trailer Number Plate'),
      ('loadout_delivery_inspection'::public.load_document_type,'VIN Plate','Delivery inspection — VIN Plate'),
      ('loadout_delivery_inspection'::public.load_document_type,'Tires and Wheels','Delivery inspection — Tires and Wheels'),
      ('loadout_delivery_inspection'::public.load_document_type,'Delivery Location Signage','Delivery inspection — Delivery Location Signage')
    ) AS s(document_type, photo_label, label)
    LOOP
      IF NOT EXISTS (SELECT 1 FROM public.load_documents d WHERE d.load_id=p_load_id AND d.document_type=v_slot.document_type AND lower(btrim(d.photo_label))=lower(v_slot.photo_label))
         AND NOT EXISTS (SELECT 1 FROM public.document_exceptions e WHERE e.load_id=p_load_id AND e.document_type=v_slot.document_type AND e.status='approved' AND lower(btrim(e.photo_label))=lower(v_slot.photo_label)) THEN
        v_missing := array_append(v_missing, v_slot.label);
      END IF;
    END LOOP;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.load_documents d WHERE d.load_id=p_load_id AND d.document_type IN ('bol','pod'))
       AND NOT EXISTS (SELECT 1 FROM public.document_exceptions e WHERE e.load_id=p_load_id AND e.document_type IN ('bol','pod') AND e.status='approved') THEN
      v_missing := array_append(v_missing, 'Signed delivery paperwork — BOL or POD');
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.load_documents d WHERE d.load_id=p_load_id AND d.document_type IN ('rate_confirmation','revised_rate_confirmation'))
     AND NOT EXISTS (SELECT 1 FROM public.document_exceptions e WHERE e.load_id=p_load_id AND e.document_type IN ('rate_confirmation','revised_rate_confirmation') AND e.status='approved') THEN
    v_missing := array_append(v_missing, 'Rate confirmation');
  END IF;
  IF v_load.load_type = 'per_ton'::public.load_type
     AND NOT EXISTS (SELECT 1 FROM public.load_documents d WHERE d.load_id=p_load_id AND d.document_type='scale_ticket')
     AND NOT EXISTS (SELECT 1 FROM public.document_exceptions e WHERE e.load_id=p_load_id AND e.document_type='scale_ticket' AND e.status='approved') THEN
    v_missing := array_append(v_missing, 'Scale ticket');
  END IF;
  IF EXISTS (SELECT 1 FROM public.load_charges c WHERE c.load_id=p_load_id AND lower(c.charge_type)='lumper')
     AND NOT EXISTS (SELECT 1 FROM public.load_documents d WHERE d.load_id=p_load_id AND d.document_type='lumper_receipt')
     AND NOT EXISTS (SELECT 1 FROM public.document_exceptions e WHERE e.load_id=p_load_id AND e.document_type='lumper_receipt' AND e.status='approved') THEN
    v_missing := array_append(v_missing, 'Lumper receipt');
  END IF;
  SELECT * INTO v_broker FROM public.brokers WHERE id=v_load.broker_id AND company_id=v_load.company_id;
  IF NOT FOUND OR nullif(btrim(v_broker.address_line1),'') IS NULL OR nullif(btrim(v_broker.city),'') IS NULL
     OR nullif(btrim(v_broker.state),'') IS NULL OR nullif(btrim(v_broker.zip),'') IS NULL THEN
    v_missing := array_append(v_missing, 'Broker billing address');
  END IF;
  RETURN v_missing;
END $$;
REVOKE ALL ON FUNCTION public.invoice_readiness_missing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invoice_readiness_missing(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assert_invoice_ready(p_load_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE v_missing text[];
BEGIN
  v_missing := public.invoice_readiness_missing(p_load_id);
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'Missing before invoicing: %.', array_to_string(v_missing, '; ') USING ERRCODE='22000';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_invoice_ready(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_invoice_ready(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_load_status(p_load_id uuid, p_new_status load_status, p_note text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_uid uuid := auth.uid(); v_current load_status; v_company uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_seq load_status[] := ARRAY['available','covered','dispatched','in_transit','at_delivery','delivered','pod_received','accessorials_approved','ready_to_invoice','invoiced','factored','paid','settled','closed']::load_status[];
  v_billing load_status[] := ARRAY['invoiced','factored','paid','settled']::load_status[];
  v_is_mgmt boolean; v_is_disp boolean; v_from int; v_to int; v_requires_note boolean := false; v_hist_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_is_mgmt := public.has_role(v_uid, 'management') OR public.has_role(v_uid, 'owner');
  v_is_disp := public.has_role(v_uid, 'dispatcher');
  IF NOT (v_is_mgmt OR v_is_disp) THEN RAISE EXCEPTION 'You do not have permission to change load status'; END IF;
  IF p_new_status = ANY(v_billing) AND NOT v_is_mgmt
     AND NOT (p_new_status='invoiced' AND coalesce(current_setting('superdrive.invoice_issue',true),'')='on') THEN
    RAISE EXCEPTION 'Billing status changes require management access';
  END IF;
  SELECT status,company_id INTO v_current,v_company FROM public.loads WHERE id=p_load_id;
  IF v_current IS NULL OR v_company IS DISTINCT FROM public.current_company_id() THEN RAISE EXCEPTION 'Load not found'; END IF;
  IF v_current=p_new_status THEN RAISE EXCEPTION 'Load is already in that status'; END IF;
  v_from:=array_position(v_seq,v_current); v_to:=array_position(v_seq,p_new_status);
  IF p_new_status IN ('tonu','cancelled','paid','settled') OR v_from IS NULL OR v_to IS NULL OR v_to<v_from
     OR (v_to>v_from+1 AND NOT (v_current='invoiced' AND p_new_status='paid')) THEN v_requires_note:=true; END IF;
  IF v_requires_note AND v_note IS NULL THEN RAISE EXCEPTION 'A note is required for this status change'; END IF;
  IF p_new_status='ready_to_invoice'::load_status THEN PERFORM public.assert_invoice_ready(p_load_id); END IF;
  PERFORM set_config('superdrive.status_change_source','staff_screen',true);
  UPDATE public.loads SET status=p_new_status WHERE id=p_load_id;
  PERFORM set_config('superdrive.status_change_source','',true);
  SELECT id INTO v_hist_id FROM public.load_status_history WHERE load_id=p_load_id ORDER BY changed_at DESC,created_at DESC LIMIT 1;
  IF v_hist_id IS NOT NULL AND v_note IS NOT NULL THEN UPDATE public.load_status_history SET notes=v_note WHERE id=v_hist_id; END IF;
END $$;
REVOKE ALL ON FUNCTION public.update_load_status(uuid, load_status, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_load_status(uuid, load_status, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_invoice_create_paperwork()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$ BEGIN PERFORM public.assert_invoice_ready(NEW.load_id); RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.guard_invoice_create_paperwork() FROM PUBLIC, anon;
CREATE TRIGGER invoice_paperwork_gate BEFORE INSERT ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_create_paperwork();CREATE OR REPLACE FUNCTION public.create_invoice(p_load_id uuid, p_payload jsonb)
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

  -- The shared gate runs before number allocation, so a refusal never burns a number.
  PERFORM public.assert_invoice_ready(p_load_id);

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

REVOKE ALL ON FUNCTION public.create_invoice(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice(uuid, jsonb) TO authenticated, service_role;

