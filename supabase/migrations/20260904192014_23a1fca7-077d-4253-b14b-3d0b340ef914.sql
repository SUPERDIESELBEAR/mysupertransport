-- Module 5, Pass 4 / PASS 2 — the writer and the approval state machine.

-- ---------------------------------------------------------------------------
-- The transition guard. Enforces the state machine for EVERY writer, including
-- service_role, so a legal path cannot be bypassed by writing the column
-- directly. 'settled' is reachable only while the settlement writer is active.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_accessorial_adjustment_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_legal text[];
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_legal := CASE OLD.status
    WHEN 'draft'            THEN ARRAY['pending_approval','void']
    WHEN 'pending_approval' THEN ARRAY['approved','rejected','void']
    WHEN 'approved'         THEN ARRAY['settled','void']
    ELSE ARRAY[]::text[]
  END;

  IF NOT (NEW.status = ANY (v_legal)) THEN
    RAISE EXCEPTION 'Adjustment % cannot move from % to %.',
      OLD.reference, OLD.status, NEW.status USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'settled' AND NOT public.settlement_writer_active() THEN
    RAISE EXCEPTION 'Adjustment % is settled by the settlement writer, not by a caller.',
      OLD.reference USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_accessorial_adjustment_transition
  ON public.accessorial_adjustments;
CREATE TRIGGER enforce_accessorial_adjustment_transition
  BEFORE UPDATE ON public.accessorial_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_accessorial_adjustment_transition();

REVOKE ALL ON FUNCTION public.enforce_accessorial_adjustment_transition() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_accessorial_adjustment_transition() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_accessorial_adjustment_transition() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_accessorial_adjustment_transition() TO service_role;

-- ---------------------------------------------------------------------------
-- CREATE. Dispatcher, management or owner. Sequence and reference are derived
-- inside this function and can only be consumed by the INSERT below it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_accessorial_adjustment(
  p_load_id uuid,
  p_charge_type text,
  p_amount numeric,
  p_reason text,
  p_description text DEFAULT NULL,
  p_funding_source text DEFAULT NULL,
  p_actual_cost numeric DEFAULT NULL,
  p_proof_document_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_actor        uuid := public.current_profile_id();
  v_reason       text := nullif(btrim(coalesce(p_reason, '')), '');
  v_load_number  text;
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
  SELECT load_number INTO v_load_number FROM public.loads WHERE id = p_load_id;
  IF v_load_number IS NULL THEN
    RAISE EXCEPTION 'Load not found' USING ERRCODE = '23503';
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
  SELECT charge_pay_classes INTO v_policy
    FROM public.pay_policies
   WHERE is_company_default AND is_active
   ORDER BY effective_date DESC NULLS LAST, created_at DESC
   LIMIT 1;
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
$$;

REVOKE ALL ON FUNCTION public.create_accessorial_adjustment(uuid,text,numeric,text,text,text,numeric,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_accessorial_adjustment(uuid,text,numeric,text,text,text,numeric,uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_accessorial_adjustment(uuid,text,numeric,text,text,text,numeric,uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- SUBMIT. draft -> pending_approval. Same three roles.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_accessorial_adjustment(p_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_actor  uuid := public.current_profile_id();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_ref    text;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'management'::app_role)
          OR public.has_role(v_uid, 'owner'::app_role)
          OR public.has_role(v_uid, 'dispatcher'::app_role)) THEN
    RAISE EXCEPTION 'Only a dispatcher, management or owner may submit a late accessorial.'
      USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A reason is required to submit a late accessorial for approval.';
  END IF;

  SELECT reference, status INTO v_ref, v_status
    FROM public.accessorial_adjustments WHERE id = p_id FOR UPDATE;
  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'Adjustment not found' USING ERRCODE = '23503';
  END IF;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Adjustment % is %, not draft.', v_ref, v_status USING ERRCODE = '42501';
  END IF;

  UPDATE public.accessorial_adjustments
     SET status = 'pending_approval' WHERE id = p_id;

  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (v_actor, public._audit_actor_name(v_uid), 'accessorial_adjustment_submitted',
          'accessorial_adjustment', p_id, v_ref, jsonb_build_object('reason', v_reason));
END;
$$;

REVOKE ALL ON FUNCTION public.submit_accessorial_adjustment(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_accessorial_adjustment(uuid,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_accessorial_adjustment(uuid,text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- APPROVE. pending_approval -> approved. MANAGEMENT OR OWNER ONLY: this is the
-- moment the money becomes real, and it is why the table exists.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_accessorial_adjustment(p_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_actor  uuid := public.current_profile_id();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_ref    text;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'management'::app_role)
          OR public.has_role(v_uid, 'owner'::app_role)) THEN
    RAISE EXCEPTION 'Only management or owner may approve a late accessorial.'
      USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A reason is required to approve a late accessorial.';
  END IF;

  SELECT reference, status INTO v_ref, v_status
    FROM public.accessorial_adjustments WHERE id = p_id FOR UPDATE;
  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'Adjustment not found' USING ERRCODE = '23503';
  END IF;
  IF v_status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Adjustment % is %, not pending approval.', v_ref, v_status
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.accessorial_adjustments
     SET status = 'approved', approved_at = now(), approved_by = v_actor
   WHERE id = p_id;

  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (v_actor, public._audit_actor_name(v_uid), 'accessorial_adjustment_approved',
          'accessorial_adjustment', p_id, v_ref, jsonb_build_object('reason', v_reason));
END;
$$;

REVOKE ALL ON FUNCTION public.approve_accessorial_adjustment(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_accessorial_adjustment(uuid,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.approve_accessorial_adjustment(uuid,text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- REJECT. pending_approval -> rejected. Management or owner only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_accessorial_adjustment(p_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_actor  uuid := public.current_profile_id();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_ref    text;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'management'::app_role)
          OR public.has_role(v_uid, 'owner'::app_role)) THEN
    RAISE EXCEPTION 'Only management or owner may reject a late accessorial.'
      USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A reason is required to reject a late accessorial.';
  END IF;

  SELECT reference, status INTO v_ref, v_status
    FROM public.accessorial_adjustments WHERE id = p_id FOR UPDATE;
  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'Adjustment not found' USING ERRCODE = '23503';
  END IF;
  IF v_status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Adjustment % is %, not pending approval.', v_ref, v_status
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.accessorial_adjustments SET status = 'rejected' WHERE id = p_id;

  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (v_actor, public._audit_actor_name(v_uid), 'accessorial_adjustment_rejected',
          'accessorial_adjustment', p_id, v_ref, jsonb_build_object('reason', v_reason));
END;
$$;

REVOKE ALL ON FUNCTION public.reject_accessorial_adjustment(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_accessorial_adjustment(uuid,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reject_accessorial_adjustment(uuid,text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- VOID. draft / pending_approval / approved -> void, with a reason on the row.
-- Refused on settled. Management or owner: voiding an APPROVED adjustment
-- unmakes money, so it carries the approval gate, not the entry gate.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.void_accessorial_adjustment(p_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_actor  uuid := public.current_profile_id();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_ref    text;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'management'::app_role)
          OR public.has_role(v_uid, 'owner'::app_role)) THEN
    RAISE EXCEPTION 'Only management or owner may void a late accessorial.'
      USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A reason is required to void a late accessorial.';
  END IF;

  SELECT reference, status INTO v_ref, v_status
    FROM public.accessorial_adjustments WHERE id = p_id FOR UPDATE;
  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'Adjustment not found' USING ERRCODE = '23503';
  END IF;
  IF v_status = 'settled' THEN
    RAISE EXCEPTION 'Adjustment % has been settled; it cannot be voided.', v_ref
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.accessorial_adjustments
     SET status = 'void', void_reason = v_reason WHERE id = p_id;

  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (v_actor, public._audit_actor_name(v_uid), 'accessorial_adjustment_voided',
          'accessorial_adjustment', p_id, v_ref, jsonb_build_object('reason', v_reason));
END;
$$;

REVOKE ALL ON FUNCTION public.void_accessorial_adjustment(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.void_accessorial_adjustment(uuid,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.void_accessorial_adjustment(uuid,text) TO authenticated, service_role;

COMMENT ON FUNCTION public.create_accessorial_adjustment(uuid,text,numeric,text,text,text,numeric,uuid) IS
  'Module 5 Pass 4 / Pass 2. The ONLY way a row reaches accessorial_adjustments: no RLS policy admits a client INSERT. sequence is max+1 for the load, derived here under an advisory lock and consumed only by the INSERT below it, so a refused attempt consumes nothing. Deliberately does NOT check load status - this path exists for loads assert_charge_entry_allowed freezes.';