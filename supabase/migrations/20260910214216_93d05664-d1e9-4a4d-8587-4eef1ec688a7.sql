-- Submission notifies whoever can act on it. Written INSIDE the protected
-- writer, so a submission that happens cannot be a submission nobody hears
-- about; the app has no way to submit without this running.
CREATE OR REPLACE FUNCTION public.submit_accessorial_adjustment(p_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_actor  uuid := public.current_profile_id();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_ref    text;
  v_status text;
  v_type   text;
  v_load   uuid;
  v_proof  uuid;
  v_kind   text;
  v_amount numeric;
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

  SELECT reference, status, charge_type, load_id, proof_document_id, amount
    INTO v_ref, v_status, v_type, v_load, v_proof, v_amount
    FROM public.accessorial_adjustments WHERE id = p_id FOR UPDATE;
  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'Adjustment not found' USING ERRCODE = '23503';
  END IF;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Adjustment % is %, not draft.', v_ref, v_status USING ERRCODE = '42501';
  END IF;

  v_kind := public.accessorial_proof_kind(v_type);
  IF v_proof IS NULL THEN
    RAISE EXCEPTION
      'Adjustment % cannot be submitted without backup documentation (% required for a % charge).',
      v_ref,
      CASE v_kind
        WHEN 'broker_agreement' THEN 'the broker''s written agreement'
        WHEN 'receipt'          THEN 'the receipt'
        ELSE 'a supporting document'
      END,
      v_type;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.load_documents
                  WHERE id = v_proof AND load_id = v_load) THEN
    RAISE EXCEPTION 'The proof document on % no longer belongs to this load.', v_ref;
  END IF;

  UPDATE public.accessorial_adjustments
     SET status = 'pending_approval', proof_kind = v_kind WHERE id = p_id;

  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (v_actor, public._audit_actor_name(v_uid), 'accessorial_adjustment_submitted',
          'accessorial_adjustment', p_id, v_ref,
          jsonb_build_object('reason', v_reason, 'proof_kind', v_kind,
                             'proof_document_id', v_proof));

  -- Management and the owner can approve any amount, so they are always the
  -- right audience. Dispatchers are not notified: an approval they may not be
  -- allowed to give is not an alert, it is noise.
  INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id, priority)
  SELECT DISTINCT ur.user_id,
         'accessorial_adjustment_submitted',
         'Late accessorial awaiting approval',
         v_ref || ' — ' || to_char(v_amount, 'FM999999990.00') || ' ' || v_type
           || ', sent by ' || public._audit_actor_name(v_uid),
         '/management?view=late-accessorials',
         'accessorial_adjustment', p_id, 'act_now'
    FROM public.user_roles ur
   WHERE ur.role IN ('management'::app_role, 'owner'::app_role)
     AND ur.user_id <> v_uid;
END;
$function$;