-- P79: required documents and packet contents become per-carrier settings.
-- P78: every invoice goes to the factor; "not approved" brokers stop invoicing.

CREATE TABLE public.document_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.carrier_profile(id) ON DELETE RESTRICT,
  document_type text NOT NULL,
  required_before_invoicing text NOT NULL DEFAULT 'no'
    CHECK (required_before_invoicing IN ('always','when_applies','no')),
  applies_when text CHECK (applies_when IN ('lumper_billed','per_ton','detention_billed','loadout')),
  in_packet boolean NOT NULL DEFAULT true,
  position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE (company_id, document_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_requirements TO authenticated;
GRANT ALL ON public.document_requirements TO service_role;
ALTER TABLE public.document_requirements ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.document_requirement_settings (
  company_id uuid PRIMARY KEY REFERENCES public.carrier_profile(id) ON DELETE RESTRICT,
  bol_or_pod_either boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_requirement_settings TO authenticated;
GRANT ALL ON public.document_requirement_settings TO service_role;
ALTER TABLE public.document_requirement_settings ENABLE ROW LEVEL SECURITY;

-- Tenancy habit 1: restrictive company isolation.
CREATE POLICY tenant_isolation ON public.document_requirements AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));
CREATE POLICY tenant_isolation ON public.document_requirement_settings AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

-- Staff and the company's own drivers read; management and owner write.
CREATE POLICY document_requirements_read ON public.document_requirements FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'dispatcher') OR public.has_role(auth.uid(),'management')
      OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'onboarding_staff')
      OR public.has_role(auth.uid(),'operator'));
CREATE POLICY document_requirements_mgmt_insert ON public.document_requirements FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner'));
CREATE POLICY document_requirements_mgmt_update ON public.document_requirements FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner'));
CREATE POLICY document_requirements_mgmt_delete ON public.document_requirements FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner'));

CREATE POLICY document_requirement_settings_read ON public.document_requirement_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'dispatcher') OR public.has_role(auth.uid(),'management')
      OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'onboarding_staff')
      OR public.has_role(auth.uid(),'operator'));
CREATE POLICY document_requirement_settings_mgmt_insert ON public.document_requirement_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner'));
CREATE POLICY document_requirement_settings_mgmt_update ON public.document_requirement_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner'));

-- The fixed "When it applies" condition. Only these four types have one.
CREATE OR REPLACE FUNCTION public.document_requirement_condition(p_type text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'extensions'
AS $$ SELECT CASE p_type
  WHEN 'lumper_receipt' THEN 'lumper_billed'
  WHEN 'scale_ticket' THEN 'per_ton'
  WHEN 'detention_documentation' THEN 'detention_billed'
  WHEN 'loadout_pickup_inspection' THEN 'loadout'
  WHEN 'loadout_delivery_inspection' THEN 'loadout'
END $$;
REVOKE ALL ON FUNCTION public.document_requirement_condition(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.document_requirement_condition(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.document_requirement_label(p_type text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'extensions'
AS $$ SELECT CASE p_type
  WHEN 'bol' THEN 'Bill of lading'
  WHEN 'pod' THEN 'Proof of delivery'
  WHEN 'rate_confirmation' THEN 'Rate confirmation'
  WHEN 'revised_rate_confirmation' THEN 'Revised rate confirmation'
  WHEN 'lumper_receipt' THEN 'Lumper receipt'
  WHEN 'scale_ticket' THEN 'Scale ticket'
  WHEN 'detention_documentation' THEN 'Detention documentation'
  WHEN 'loadout_pickup_inspection' THEN 'Pickup inspection photos'
  WHEN 'loadout_delivery_inspection' THEN 'Delivery inspection photos'
  WHEN 'permit' THEN 'Permit'
  WHEN 'broker_correspondence' THEN 'Broker correspondence'
  WHEN 'reimbursement_proof' THEN 'Reimbursement proof'
  WHEN 'other' THEN 'Other document'
  ELSE p_type
END $$;
REVOKE ALL ON FUNCTION public.document_requirement_label(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.document_requirement_label(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.validate_document_requirement()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF NOT (NEW.document_type = 'invoice' OR NEW.document_type IN
          (SELECT enumlabel::text FROM pg_enum WHERE enumtypid = 'public.load_document_type'::regtype)) THEN
    RAISE EXCEPTION '"%" is not a document type.', NEW.document_type USING ERRCODE = '22000';
  END IF;
  NEW.applies_when := public.document_requirement_condition(NEW.document_type);
  IF NEW.required_before_invoicing = 'when_applies' AND NEW.applies_when IS NULL THEN
    RAISE EXCEPTION '"%" has no "When it applies" condition.', NEW.document_type USING ERRCODE = '22000';
  END IF;
  IF NEW.document_type = 'invoice' THEN
    NEW.required_before_invoicing := 'no';
    NEW.in_packet := true;
  END IF;
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN NEW.created_by := coalesce(NEW.created_by, auth.uid()); END IF;
  NEW.updated_by := coalesce(auth.uid(), NEW.updated_by);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_document_requirement() FROM PUBLIC, anon;
CREATE TRIGGER validate_document_requirement BEFORE INSERT OR UPDATE ON public.document_requirements
  FOR EACH ROW EXECUTE FUNCTION public.validate_document_requirement();

CREATE OR REPLACE FUNCTION public.stamp_document_requirement_settings()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $$ BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN NEW.created_by := coalesce(NEW.created_by, auth.uid()); END IF;
  NEW.updated_by := coalesce(auth.uid(), NEW.updated_by);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.stamp_document_requirement_settings() FROM PUBLIC, anon;
CREATE TRIGGER stamp_document_requirement_settings BEFORE INSERT OR UPDATE ON public.document_requirement_settings
  FOR EACH ROW EXECUTE FUNCTION public.stamp_document_requirement_settings();

-- Built-in defaults: reproduce P73 exactly. Used for any carrier without rows.
CREATE OR REPLACE FUNCTION public.document_requirement_defaults()
RETURNS TABLE(document_type text, required_before_invoicing text, applies_when text, in_packet boolean, "position" integer)
LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'extensions'
AS $$ SELECT t, CASE WHEN t='rate_confirmation' THEN 'always'
                     WHEN t IN ('lumper_receipt','scale_ticket','loadout_pickup_inspection','loadout_delivery_inspection') THEN 'when_applies'
                     ELSE 'no' END,
            public.document_requirement_condition(t),
            t NOT IN ('broker_correspondence','reimbursement_proof','other'),
            o::integer
       FROM unnest(ARRAY['invoice','bol','pod','rate_confirmation','revised_rate_confirmation','lumper_receipt',
                         'scale_ticket','detention_documentation','loadout_pickup_inspection','loadout_delivery_inspection',
                         'permit','broker_correspondence','reimbursement_proof','other']) WITH ORDINALITY AS u(t, o) $$;
REVOKE ALL ON FUNCTION public.document_requirement_defaults() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.document_requirement_defaults() TO authenticated, service_role;

-- Seed every carrier from its default factor's current packet order/includes, unchanged.
INSERT INTO public.document_requirements (company_id, document_type, required_before_invoicing, in_packet, position)
SELECT f.company_id, u.t, d.required_before_invoicing,
       coalesce((f.packet_includes ->> u.t)::boolean, d.in_packet), u.o::integer
  FROM public.factoring_companies f
  CROSS JOIN LATERAL unnest(f.packet_order) WITH ORDINALITY AS u(t, o)
  JOIN public.document_requirement_defaults() d ON d.document_type = u.t
 WHERE f.is_default;
INSERT INTO public.document_requirements (company_id, document_type, required_before_invoicing, in_packet, position)
SELECT f.company_id, d.document_type, d.required_before_invoicing, d.in_packet,
       cardinality(f.packet_order) + d.position
  FROM public.factoring_companies f CROSS JOIN public.document_requirement_defaults() d
 WHERE f.is_default AND NOT (d.document_type = ANY (f.packet_order));
INSERT INTO public.document_requirement_settings (company_id, bol_or_pod_either)
SELECT DISTINCT company_id, true FROM public.document_requirements;

-- Tenancy habit 2: the company is stamped server-side, never taken from the client.
CREATE TRIGGER aa_stamp_tenant_company_id BEFORE INSERT ON public.document_requirements
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();
CREATE TRIGGER aa_stamp_tenant_company_id BEFORE INSERT ON public.document_requirement_settings
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

COMMENT ON COLUMN public.factoring_companies.packet_order IS 'DEPRECATED: replaced by document_requirements.position';
COMMENT ON COLUMN public.factoring_companies.packet_includes IS 'DEPRECATED: replaced by document_requirements.in_packet';

-- Loadout guided-photo slots; the same list as src/lib/loadoutSlots.ts.
CREATE OR REPLACE FUNCTION public.loadout_required_slots()
RETURNS TABLE(document_type text, photo_label text, label text, ord integer)
LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'extensions'
AS $$ SELECT * FROM (VALUES
  ('loadout_pickup_inspection','Front','Pickup inspection — Front',1),
  ('loadout_pickup_inspection','Driver Side','Pickup inspection — Driver Side',2),
  ('loadout_pickup_inspection','Passenger Side','Pickup inspection — Passenger Side',3),
  ('loadout_pickup_inspection','Rear Doors Closed','Pickup inspection — Rear Doors Closed',4),
  ('loadout_pickup_inspection','Rear Doors Open','Pickup inspection — Roof check — doors open',5),
  ('loadout_pickup_inspection','Trailer Number Plate','Pickup inspection — Trailer Number Plate',6),
  ('loadout_pickup_inspection','VIN Plate','Pickup inspection — VIN Plate',7),
  ('loadout_pickup_inspection','Tires and Wheels','Pickup inspection — Tires and Wheels',8),
  ('loadout_pickup_inspection','Annual Inspection Sticker','Pickup inspection — Annual Inspection Sticker',9),
  ('loadout_delivery_inspection','Front','Delivery inspection — Front',10),
  ('loadout_delivery_inspection','Driver Side','Delivery inspection — Driver Side',11),
  ('loadout_delivery_inspection','Passenger Side','Delivery inspection — Passenger Side',12),
  ('loadout_delivery_inspection','Rear Doors Closed','Delivery inspection — Rear Doors Closed',13),
  ('loadout_delivery_inspection','Trailer Number Plate','Delivery inspection — Trailer Number Plate',14),
  ('loadout_delivery_inspection','VIN Plate','Delivery inspection — VIN Plate',15),
  ('loadout_delivery_inspection','Tires and Wheels','Delivery inspection — Tires and Wheels',16),
  ('loadout_delivery_inspection','Delivery Location Signage','Delivery inspection — Delivery Location Signage',17)
) AS s(document_type, photo_label, label, ord) $$;
REVOKE ALL ON FUNCTION public.loadout_required_slots() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.loadout_required_slots() TO authenticated, service_role;

-- A document of one of the types, or an approved/resolved exception, satisfies.
CREATE OR REPLACE FUNCTION public._load_has_paperwork(p_load_id uuid, p_types text[], p_photo_label text)
RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public', 'extensions'
AS $$ SELECT EXISTS (SELECT 1 FROM public.load_documents d
                      WHERE d.load_id = p_load_id AND d.document_type::text = ANY (p_types)
                        AND (p_photo_label IS NULL OR lower(btrim(d.photo_label)) = lower(p_photo_label)))
          OR EXISTS (SELECT 1 FROM public.document_exceptions e
                      WHERE e.load_id = p_load_id AND e.document_type::text = ANY (p_types)
                        AND e.status IN ('approved','resolved')
                        AND (p_photo_label IS NULL OR lower(btrim(e.photo_label)) = lower(p_photo_label))) $$;
REVOKE ALL ON FUNCTION public._load_has_paperwork(uuid, text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._load_has_paperwork(uuid, text[], text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.invoice_readiness_missing(p_load_id uuid)
RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_load public.loads%ROWTYPE;
  v_broker public.brokers%ROWTYPE;
  v_missing text[] := '{}';
  v_req record;
  v_slot record;
  v_either boolean;
  v_lumper boolean;
  v_detention boolean;
  v_apply boolean;
  v_has_rows boolean;
  v_broker_found boolean;
BEGIN
  IF NOT (public.has_role(auth.uid(),'dispatcher') OR public.has_role(auth.uid(),'management')
          OR public.has_role(auth.uid(),'owner')) THEN
    RAISE EXCEPTION 'Only a dispatcher, management or owner may check invoice readiness.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_load FROM public.loads WHERE id = p_load_id;
  IF NOT FOUND OR v_load.company_id IS DISTINCT FROM public.current_company_id() THEN
    RAISE EXCEPTION 'Load not found.' USING ERRCODE = '42501';
  END IF;

  v_lumper := EXISTS (SELECT 1 FROM public.load_charges c WHERE c.load_id = p_load_id AND lower(c.charge_type) = 'lumper');
  v_detention := EXISTS (SELECT 1 FROM public.load_charges c WHERE c.load_id = p_load_id AND lower(c.charge_type) = 'detention');
  SELECT s.bol_or_pod_either INTO v_either FROM public.document_requirement_settings s WHERE s.company_id = v_load.company_id;
  v_either := coalesce(v_either, true);

  IF v_either AND v_load.load_type <> 'loadout'::public.load_type
     AND NOT public._load_has_paperwork(p_load_id, ARRAY['bol','pod'], NULL) THEN
    v_missing := array_append(v_missing, 'Signed delivery paperwork — BOL or POD');
  END IF;

  v_has_rows := EXISTS (SELECT 1 FROM public.document_requirements r WHERE r.company_id = v_load.company_id);
  FOR v_req IN
    SELECT r.document_type, r.required_before_invoicing, r.applies_when, r.position
      FROM public.document_requirements r WHERE v_has_rows AND r.company_id = v_load.company_id
    UNION ALL
    SELECT d.document_type, d.required_before_invoicing, d.applies_when, d.position
      FROM public.document_requirement_defaults() d WHERE NOT v_has_rows
    ORDER BY 4, 1
  LOOP
    CONTINUE WHEN v_req.document_type = 'invoice';
    v_apply := CASE v_req.required_before_invoicing
      WHEN 'always' THEN true
      WHEN 'when_applies' THEN CASE v_req.applies_when
        WHEN 'lumper_billed' THEN v_lumper
        WHEN 'detention_billed' THEN v_detention
        WHEN 'per_ton' THEN v_load.load_type = 'per_ton'::public.load_type
        WHEN 'loadout' THEN v_load.load_type = 'loadout'::public.load_type
        ELSE false END
      ELSE false END;
    CONTINUE WHEN NOT v_apply;
    IF v_req.document_type IN ('loadout_pickup_inspection','loadout_delivery_inspection')
       AND v_load.load_type = 'loadout'::public.load_type THEN
      FOR v_slot IN SELECT * FROM public.loadout_required_slots() s WHERE s.document_type = v_req.document_type ORDER BY s.ord LOOP
        IF NOT public._load_has_paperwork(p_load_id, ARRAY[v_slot.document_type], v_slot.photo_label) THEN
          v_missing := array_append(v_missing, v_slot.label);
        END IF;
      END LOOP;
    ELSIF NOT public._load_has_paperwork(p_load_id,
        CASE WHEN v_req.document_type = 'rate_confirmation' THEN ARRAY['rate_confirmation','revised_rate_confirmation']
             ELSE ARRAY[v_req.document_type] END, NULL) THEN
      v_missing := array_append(v_missing, public.document_requirement_label(v_req.document_type));
    END IF;
  END LOOP;

  SELECT * INTO v_broker FROM public.brokers WHERE id = v_load.broker_id AND company_id = v_load.company_id;
  v_broker_found := FOUND;
  IF NOT v_broker_found OR nullif(btrim(v_broker.address_line1),'') IS NULL OR nullif(btrim(v_broker.city),'') IS NULL
     OR nullif(btrim(v_broker.state),'') IS NULL OR nullif(btrim(v_broker.zip),'') IS NULL THEN
    v_missing := array_append(v_missing, 'Broker billing address');
  END IF;
  IF v_broker_found AND v_broker.factoring_status = 'not_approved'::public.broker_factoring_status
     AND EXISTS (SELECT 1 FROM public.factoring_companies f WHERE f.company_id = v_load.company_id AND f.is_default) THEN
    v_missing := array_append(v_missing, 'Broker is marked not approved by the factor');
  END IF;
  RETURN v_missing;
END $$;
REVOKE ALL ON FUNCTION public.invoice_readiness_missing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invoice_readiness_missing(uuid) TO authenticated, service_role;

-- create_invoice: exactly 0071 except the billing path (P78).
CREATE OR REPLACE FUNCTION public.create_invoice(p_load_id uuid, p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions' AS $function$
DECLARE v_actor uuid:=public.current_profile_id();v_actor_name text:=public._audit_actor_name(public.current_profile_id());v_load public.loads%ROWTYPE;v_broker public.brokers%ROWTYPE;v_amount numeric:=coalesce((p_payload->>'amount')::numeric,0);v_sum numeric;v_path public.invoice_billing_path;v_claimed text:=nullif(p_payload->>'billing_path','');v_number text;v_id uuid;v_missing text;v_extra text;v_line jsonb;
BEGIN
IF NOT(public.has_role(auth.uid(),'management'::app_role) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'dispatcher'::app_role)) THEN RAISE EXCEPTION 'Only a dispatcher, management or owner may create an invoice.' USING ERRCODE='42501';END IF;
SELECT * INTO v_load FROM public.loads WHERE id=p_load_id FOR UPDATE;IF NOT FOUND OR v_load.company_id IS DISTINCT FROM public.current_company_id() THEN RAISE EXCEPTION 'Load not found.' USING ERRCODE='42501';END IF;
IF v_load.status<>'ready_to_invoice'::load_status THEN RAISE EXCEPTION 'Load % is %, not ready_to_invoice; it cannot be invoiced.',v_load.load_number,v_load.status USING ERRCODE='22000';END IF;
IF EXISTS(SELECT 1 FROM public.invoices WHERE load_id=p_load_id) THEN RAISE EXCEPTION 'Load % already has invoice %.',v_load.load_number,(SELECT invoice_number FROM public.invoices WHERE load_id=p_load_id) USING ERRCODE='23505';END IF;
SELECT coalesce(sum(amount),0) INTO v_sum FROM jsonb_to_recordset(coalesce(p_payload->'lines','[]'::jsonb)) AS t(line_type text,amount numeric);IF round(v_sum,2)<>round(v_amount,2) THEN RAISE EXCEPTION 'Invoice lines sum to % but the payload states %.',round(v_sum,2),round(v_amount,2) USING ERRCODE='22000';END IF;
SELECT string_agg(c.charge_type||' '||c.amount::text,', ') INTO v_missing FROM public.load_charges c WHERE c.load_id=p_load_id AND NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(coalesce(p_payload->'lines','[]'::jsonb)) AS l(load_charge_id uuid) WHERE l.load_charge_id=c.id);IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'Invoice for % omits charge(s) the load carries: %.',v_load.load_number,v_missing USING ERRCODE='22000';END IF;
SELECT string_agg(coalesce(l.load_charge_id::text,'(null)'),', ') INTO v_extra FROM jsonb_to_recordset(coalesce(p_payload->'lines','[]'::jsonb)) AS l(line_type text,load_charge_id uuid) WHERE l.line_type='charge' AND(l.load_charge_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.load_charges c WHERE c.id=l.load_charge_id AND c.load_id=p_load_id));IF v_extra IS NOT NULL THEN RAISE EXCEPTION 'Invoice for % bills charge(s) the load does not carry: %.',v_load.load_number,v_extra USING ERRCODE='22000';END IF;
IF v_load.broker_id IS NOT NULL THEN SELECT * INTO v_broker FROM public.brokers WHERE id=v_load.broker_id;IF NOT FOUND OR v_broker.company_id IS DISTINCT FROM public.current_company_id() THEN RAISE EXCEPTION 'Load not found.' USING ERRCODE='42501';END IF;END IF;
v_path:=CASE WHEN EXISTS(SELECT 1 FROM public.factoring_companies f WHERE f.company_id=v_load.company_id AND f.is_default) THEN 'factored'::invoice_billing_path WHEN v_broker.id IS NOT NULL AND v_broker.factoring_status='approved'::broker_factoring_status THEN 'factored'::invoice_billing_path ELSE 'direct'::invoice_billing_path END;IF v_claimed IS NOT NULL AND v_claimed<>v_path::text THEN RAISE EXCEPTION 'Payload asks to bill % but broker factoring status % forces %.',v_claimed,coalesce(v_broker.factoring_status::text,'no broker'),v_path USING ERRCODE='22000';END IF;
PERFORM public.assert_invoice_ready(p_load_id);v_number:=public.allocate_invoice_number();
INSERT INTO public.invoices(load_id,broker_id,broker_name_snapshot,broker_billing_email_snapshot,invoice_number,billing_path,amount,status,created_by,updated_by) VALUES(p_load_id,v_load.broker_id,v_broker.company_name,v_broker.billing_email,v_number,v_path,round(v_amount,2),'open'::invoice_status,v_actor,v_actor) RETURNING id INTO v_id;
FOR v_line IN SELECT * FROM jsonb_array_elements(coalesce(p_payload->'lines','[]'::jsonb)) LOOP INSERT INTO public.invoice_line_items(invoice_id,line_type,description,amount,load_charge_id,charge_type,created_by) VALUES(v_id,v_line->>'line_type',nullif(v_line->>'description',''),round(coalesce((v_line->>'amount')::numeric,0),2),nullif(v_line->>'load_charge_id','')::uuid,nullif(v_line->>'charge_type',''),v_actor);END LOOP;
PERFORM set_config('superdrive.invoice_issue','on',true);PERFORM public.update_load_status(p_load_id,'invoiced'::load_status,NULL);PERFORM set_config('superdrive.invoice_issue','',true);
INSERT INTO public.audit_log(actor_id,actor_name,action,entity_type,entity_id,entity_label,metadata) VALUES(v_actor,v_actor_name,'invoice_created','invoices',v_id,v_number,jsonb_build_object('load_id',p_load_id,'load_number',v_load.load_number,'amount',round(v_amount,2),'billing_path',v_path,'broker_factoring_status',coalesce(v_broker.factoring_status::text,'no broker'),'line_count',jsonb_array_length(coalesce(p_payload->'lines','[]'::jsonb))));RETURN jsonb_build_object('invoice_id',v_id,'invoice_number',v_number,'billing_path',v_path,'amount',round(v_amount,2),'load_number',v_load.load_number);
END;$function$;
REVOKE ALL ON FUNCTION public.create_invoice(uuid,jsonb) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.create_invoice(uuid,jsonb) TO authenticated,service_role;