CREATE OR REPLACE FUNCTION public.attach_accessorial_adjustment_proof(
  p_id uuid,
  p_proof_document_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_actor uuid := public.current_profile_id();
  v_ref   text;
  v_status text;
  v_load  uuid;
  v_type  text;
  v_kind  text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'management'::app_role)
          OR public.has_role(v_uid, 'owner'::app_role)
          OR public.has_role(v_uid, 'dispatcher'::app_role)) THEN
    RAISE EXCEPTION 'Only a dispatcher, management or owner may attach backup documentation.'
      USING ERRCODE = '42501';
  END IF;
  IF p_proof_document_id IS NULL THEN
    RAISE EXCEPTION 'A document is required.';
  END IF;

  SELECT reference, status, load_id, charge_type
    INTO v_ref, v_status, v_load, v_type
    FROM public.accessorial_adjustments WHERE id = p_id FOR UPDATE;
  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'Adjustment not found' USING ERRCODE = '23503';
  END IF;
  -- Only a draft may gain paperwork. Once it is out for approval or approved the
  -- evidence behind the decision must not change underneath the approver.
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Adjustment % is %, so its backup documentation can no longer be changed.',
      v_ref, v_status USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.load_documents
                  WHERE id = p_proof_document_id AND load_id = v_load) THEN
    RAISE EXCEPTION 'That document does not belong to this load.';
  END IF;

  v_kind := public.accessorial_proof_kind(v_type);

  UPDATE public.accessorial_adjustments
     SET proof_document_id = p_proof_document_id
   WHERE id = p_id;

  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (v_actor, public._audit_actor_name(v_uid), 'accessorial_adjustment_proof_attached',
          'accessorial_adjustment', p_id, v_ref,
          jsonb_build_object('proof_document_id', p_proof_document_id, 'proof_kind', v_kind));
END;
$$;

COMMENT ON FUNCTION public.attach_accessorial_adjustment_proof(uuid, uuid) IS
  'Attaches a load document as backup documentation on a DRAFT late accessorial. Drafts only: evidence behind an approval decision is frozen once it leaves draft. Never accepts a file — the document must already exist on the same load.';

REVOKE ALL ON FUNCTION public.attach_accessorial_adjustment_proof(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_accessorial_adjustment_proof(uuid, uuid) TO authenticated, service_role;