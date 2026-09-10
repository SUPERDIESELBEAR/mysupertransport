-- ---------------------------------------------------------------------------
-- Module 5 Pass 5 — making the late-accessorial path reachable, safely.
--
-- Two rules change, and both are enforced in the DATABASE. A screen that hides
-- a button is not a control.
-- ---------------------------------------------------------------------------

-- 1. THE LIMIT -------------------------------------------------------------

ALTER TABLE public.settlement_settings
  ADD COLUMN IF NOT EXISTS dispatcher_accessorial_approval_limit numeric NULL
    CONSTRAINT settlement_settings_dispatcher_limit_check
      CHECK (dispatcher_accessorial_approval_limit IS NULL
             OR dispatcher_accessorial_approval_limit > 0);

COMMENT ON COLUMN public.settlement_settings.dispatcher_accessorial_approval_limit IS
  'Dollar ceiling under which a dispatcher may approve a late accessorial. NULL '
  'means dispatchers approve nothing, which is the rule that applied before this '
  'column existed; the owner sets the value. Read inside '
  'approve_accessorial_adjustment and NEVER accepted as an argument — a value the '
  'caller supplies is a value the caller can change (same reasoning as company_id '
  'being trigger-stamped rather than defaulted).';

-- The history trigger enumerates its fields, so a new setting is invisible to
-- the audit trail until it is named here.
CREATE OR REPLACE FUNCTION public.record_settlement_settings_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  _actor uuid;
  _f text;
  _old text;
  _new text;
BEGIN
  _actor := public.current_profile_id();
  NEW.updated_at := now();
  NEW.updated_by := _actor;

  FOREACH _f IN ARRAY ARRAY[
    'minimum_net_pay_threshold','hold_buffer','equipment_value_per_driver',
    'rm_deposit_target','rm_weekly_deduction','work_week_start_dow',
    'dispatcher_accessorial_approval_limit'
  ] LOOP
    EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', _f, _f)
      INTO _old, _new USING OLD, NEW;
    IF _old IS DISTINCT FROM _new THEN
      INSERT INTO public.settlement_settings_history (field, previous_value, new_value, changed_by)
      VALUES (_f, _old, _new, _actor);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- 2. PROOF ------------------------------------------------------------------

-- What was relied on, recorded at the moment of submission. Derived values go
-- stale when the rule changes; a stamped one does not.
ALTER TABLE public.accessorial_adjustments
  ADD COLUMN IF NOT EXISTS proof_kind text NULL
    CONSTRAINT accessorial_adjustments_proof_kind_check
      CHECK (proof_kind IS NULL
             OR proof_kind = ANY (ARRAY['broker_agreement','receipt','any_document']));

COMMENT ON COLUMN public.accessorial_adjustments.proof_kind IS
  'What kind of proof was required when this was submitted, stamped by '
  'submit_accessorial_adjustment from accessorial_proof_kind(charge_type).';

-- TOTAL by construction: every charge type resolves, listed or not. An
-- unmapped kind falls to any_document rather than becoming unsubmittable.
CREATE OR REPLACE FUNCTION public.accessorial_proof_kind(p_charge_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT CASE lower(coalesce(p_charge_type, ''))
    WHEN 'detention'     THEN 'broker_agreement'
    WHEN 'layover'       THEN 'broker_agreement'
    WHEN 'tonu'          THEN 'broker_agreement'
    WHEN 'stopoff'       THEN 'broker_agreement'
    WHEN 'lumper'        THEN 'receipt'
    WHEN 'reimbursement' THEN 'receipt'
    ELSE 'any_document'
  END
$function$;

COMMENT ON FUNCTION public.accessorial_proof_kind(text) IS
  'PROPOSED BY THE BUILD 2026-09-10, NOT STATED BY THE OWNER. The owner said '
  '"backup documents required, depends on the charge type"; this mapping is the '
  'build''s inference from it — money the broker must agree to needs the broker''s '
  'written agreement, money someone spent needs the receipt. It may be wrong and '
  'is to be corrected once real ones have been seen. The ELSE branch is '
  'deliberate: every charge type must resolve to something, or a late accessorial '
  'of an unlisted kind could not be submitted at all.';

REVOKE ALL ON FUNCTION public.accessorial_proof_kind(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accessorial_proof_kind(text) TO authenticated, service_role;

-- 3. SUBMIT — proof becomes mandatory ---------------------------------------

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

  SELECT reference, status, charge_type, load_id, proof_document_id
    INTO v_ref, v_status, v_type, v_load, v_proof
    FROM public.accessorial_adjustments WHERE id = p_id FOR UPDATE;
  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'Adjustment not found' USING ERRCODE = '23503';
  END IF;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Adjustment % is %, not draft.', v_ref, v_status USING ERRCODE = '42501';
  END IF;

  -- Backup documentation is required at EVERY amount. The approval limit
  -- governs who signs it off, not whether proof is needed.
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
END;
$function$;

-- 4. APPROVE — the limit, read here and only here ---------------------------

CREATE OR REPLACE FUNCTION public.approve_accessorial_adjustment(p_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_actor   uuid := public.current_profile_id();
  v_reason  text := nullif(btrim(coalesce(p_reason, '')), '');
  v_ref     text;
  v_status  text;
  v_amount  numeric;
  v_proof   uuid;
  v_senior  boolean;
  v_limit   numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  v_senior := public.has_role(v_uid, 'management'::app_role)
              OR public.has_role(v_uid, 'owner'::app_role);

  IF NOT (v_senior OR public.has_role(v_uid, 'dispatcher'::app_role)) THEN
    RAISE EXCEPTION 'Only a dispatcher, management or owner may approve a late accessorial.'
      USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A reason is required to approve a late accessorial.';
  END IF;

  SELECT reference, status, amount, proof_document_id
    INTO v_ref, v_status, v_amount, v_proof
    FROM public.accessorial_adjustments WHERE id = p_id FOR UPDATE;
  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'Adjustment not found' USING ERRCODE = '23503';
  END IF;
  IF v_status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Adjustment % is %, not pending approval.', v_ref, v_status
      USING ERRCODE = '42501';
  END IF;

  -- Second layer. Submission already refuses this; approval is where money
  -- starts moving, so it does not take submission's word for it.
  IF v_proof IS NULL THEN
    RAISE EXCEPTION 'Adjustment % has no backup documentation attached.', v_ref
      USING ERRCODE = '42501';
  END IF;

  IF NOT v_senior THEN
    -- READ, NEVER PASSED. The caller cannot supply, hint at, or override this
    -- number; it comes from the settings row every time.
    SELECT dispatcher_accessorial_approval_limit INTO v_limit
      FROM public.settlement_settings WHERE singleton;

    IF v_limit IS NULL THEN
      RAISE EXCEPTION
        'No dispatcher approval limit is set, so only management or the owner may approve %.', v_ref
        USING ERRCODE = '42501';
    END IF;
    IF v_amount >= v_limit THEN
      RAISE EXCEPTION
        'Adjustment % is %, at or above the dispatcher approval limit of %. Management or the owner must approve it.',
        v_ref, to_char(v_amount, 'FM999999990.00'), to_char(v_limit, 'FM999999990.00')
        USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.accessorial_adjustments
     SET status = 'approved', approved_at = now(), approved_by = v_actor
   WHERE id = p_id;

  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (v_actor, public._audit_actor_name(v_uid), 'accessorial_adjustment_approved',
          'accessorial_adjustment', p_id, v_ref,
          jsonb_build_object('reason', v_reason, 'amount', v_amount,
                             'approved_as', CASE WHEN v_senior THEN 'management_or_owner'
                                                 ELSE 'dispatcher_under_limit' END,
                             'dispatcher_limit', v_limit));
END;
$function$;

COMMENT ON FUNCTION public.approve_accessorial_adjustment(uuid, text) IS
  'Approves a late accessorial. The dispatcher approval ceiling is READ from '
  'settlement_settings inside this function and is never an argument: a value the '
  'caller supplies is a value the caller can change. Management and owner are '
  'unbounded; a dispatcher may approve only strictly below the configured limit, '
  'and nothing at all while the limit is NULL. Proof is re-checked here because '
  'approval is where the money starts moving.';