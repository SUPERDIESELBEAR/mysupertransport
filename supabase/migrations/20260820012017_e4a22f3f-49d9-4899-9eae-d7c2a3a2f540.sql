-- Re-pin search_path to "public, extensions" (part 3 of 3) and align EXECUTE
-- grants with each function's real caller.
-- Bodies are byte-identical to the live definitions (pg_get_functiondef).

CREATE OR REPLACE FUNCTION public.submit_application_draft(p_token uuid, p_payload jsonb, p_ssn_encrypted text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_id uuid;
  v_payload jsonb;
  v_existing public.applications;
BEGIN
  IF p_token IS NULL THEN
    RAISE EXCEPTION 'token_required';
  END IF;

  SELECT * INTO v_existing
  FROM public.applications
  WHERE draft_token = p_token::text
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF v_existing.is_draft = false THEN
    RAISE EXCEPTION 'already_submitted';
  END IF;

  v_payload := COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object('current_step', 9);
  IF p_ssn_encrypted IS NOT NULL AND length(btrim(p_ssn_encrypted)) > 0 THEN
    v_payload := v_payload || jsonb_build_object('ssn_encrypted', p_ssn_encrypted);
  END IF;

  SELECT id INTO v_id FROM public.save_application_draft(p_token, v_payload);

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  -- Flip to submitted. A draft that was reopened for revisions returns to
  -- pending so staff get their review actions back; pre_revision_status is
  -- preserved so a previously approved application routes to re-approval.
  UPDATE public.applications
     SET is_draft     = false,
         submitted_at = now(),
         review_status = CASE
           WHEN review_status IS NULL THEN 'pending'::review_status
           WHEN review_status = 'revisions_requested'::review_status THEN 'pending'::review_status
           ELSE review_status
         END,
         updated_at   = now()
   WHERE id = v_id
     AND is_draft = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'already_submitted';
  END IF;

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_claim_flag_resolution()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_resolved boolean;
BEGIN
  v_resolved := (NULLIF(btrim(COALESCE(NEW.resolution, '')), '') IS NOT NULL)
                OR NEW.flag_level = 'cleared'::claim_flag_level;

  IF v_resolved THEN
    NEW.is_active := false;
    IF NEW.resolved_at IS NULL THEN
      NEW.resolved_at := now();
    END IF;
    IF NEW.resolved_by IS NULL THEN
      NEW.resolved_by := public.current_profile_id();
    END IF;
  ELSE
    NEW.resolved_at := NULL;
    NEW.resolved_by := NULL;
    IF TG_OP = 'UPDATE' AND OLD.is_active = false THEN
      NEW.is_active := true;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_ica_completion_to_onboarding()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_signed_date DATE;
  v_sent_date   DATE;
BEGIN
  IF NEW.operator_id IS NOT NULL
     AND (NEW.status = 'fully_executed' OR NEW.contractor_signed_at IS NOT NULL) THEN

    v_signed_date := (COALESCE(NEW.contractor_signed_at, NEW.carrier_signed_at, now())
                        AT TIME ZONE 'America/Chicago')::date;
    v_sent_date   := (COALESCE(NEW.created_at, now()) AT TIME ZONE 'America/Chicago')::date;

    PERFORM set_config('app.ica_sync_cascade', '1', true);

    UPDATE public.onboarding_status
    SET
      ica_status      = 'complete',
      ica_signed_date = COALESCE(ica_signed_date, v_signed_date),
      ica_sent_date   = COALESCE(ica_sent_date, v_sent_date),
      updated_at      = now()
    WHERE operator_id = NEW.operator_id
      AND (COALESCE(ica_status::text, '') <> 'complete'
           OR ica_signed_date IS NULL
           OR ica_sent_date IS NULL);

    PERFORM set_config('app.ica_sync_cascade', '', true);
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_inspection_doc_to_dot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_operator_id  uuid;
  v_default_int  int;
BEGIN
  IF NEW.name <> 'Periodic DOT Inspections' OR NEW.scope <> 'per_driver' THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.skip_doc_sync', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.driver_id IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO v_operator_id
  FROM public.operators
  WHERE user_id = NEW.driver_id
  LIMIT 1;

  IF v_operator_id IS NULL THEN RETURN NEW; END IF;

  SELECT default_dot_reminder_interval_days INTO v_default_int
  FROM public.fleet_settings
  ORDER BY updated_at DESC
  LIMIT 1;

  v_default_int := COALESCE(v_default_int, 360);

  PERFORM set_config('app.skip_dot_sync', 'on', true);

  INSERT INTO public.truck_dot_inspections (
    operator_id, inspection_date, reminder_interval, result,
    certificate_file_url, certificate_file_path, certificate_file_name,
    inspector_name, created_by
  ) VALUES (
    v_operator_id,
    COALESCE(NEW.inspection_date, CURRENT_DATE),
    v_default_int,
    COALESCE(NEW.inspection_result, 'pass'),
    NEW.file_url,
    NEW.file_path,
    NULL,
    NEW.inspector_name,
    NEW.uploaded_by
  );

  PERFORM set_config('app.skip_dot_sync', 'off', true);

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.unassign_load_driver(p_load_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_mgmt boolean;
  v_is_disp boolean;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_status load_status;
  v_operator uuid;
  v_setting boolean;
  v_reverted boolean := false;
  v_warn jsonb := '[]'::jsonb;
  v_hist_id uuid;
  v_profile uuid := public.current_profile_id();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_is_mgmt := public.has_role(v_uid, 'management') OR public.has_role(v_uid, 'owner');
  v_is_disp := public.has_role(v_uid, 'dispatcher');

  IF NOT (v_is_mgmt OR v_is_disp) THEN
    RAISE EXCEPTION 'You do not have permission to unassign drivers from loads';
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A reason is required to unassign a driver';
  END IF;

  SELECT status, operator_id INTO v_status, v_operator FROM public.loads WHERE id = p_load_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Load not found';
  END IF;
  IF v_operator IS NULL THEN
    RAISE EXCEPTION 'This load has no driver assigned';
  END IF;

  SELECT (setting_value)::text = 'true' INTO v_setting
    FROM public.company_settings WHERE setting_key = 'auto_cover_on_assignment';
  v_setting := COALESCE(v_setting, true);

  UPDATE public.loads
     SET operator_id = NULL,
         updated_by = v_profile
   WHERE id = p_load_id;

  IF v_setting AND v_status = 'covered' THEN
    UPDATE public.loads SET status = 'available' WHERE id = p_load_id;
    v_reverted := true;

    SELECT id INTO v_hist_id
      FROM public.load_status_history
     WHERE load_id = p_load_id
     ORDER BY changed_at DESC, created_at DESC
     LIMIT 1;

    IF v_hist_id IS NOT NULL THEN
      UPDATE public.load_status_history
         SET change_source = 'auto_unassignment',
             notes = 'Load returned to available on driver unassignment. Reason: ' || v_reason,
             changed_by = COALESCE(changed_by, v_profile)
       WHERE id = v_hist_id;
    END IF;
  ELSIF v_setting AND v_status <> 'available' THEN
    v_warn := v_warn || jsonb_build_object(
      'code','status_left_unchanged',
      'message','This load has progressed past covered, so its status was left unchanged. Update the status manually if needed.');
  END IF;

  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (
    v_uid,
    public._audit_actor_name(v_uid),
    'load_driver_unassigned',
    'load',
    p_load_id,
    (SELECT load_number FROM public.loads WHERE id = p_load_id),
    jsonb_build_object(
      'operator_id', v_operator,
      'reason', v_reason,
      'status_reverted', v_reverted,
      'actor_profile_id', v_profile
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'status_reverted', v_reverted,
    'warnings', v_warn
  );
END;
$function$
;

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

  IF p_new_status = ANY(v_billing) AND NOT v_is_mgmt THEN
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

  UPDATE public.loads SET status = p_new_status WHERE id = p_load_id;

  SELECT id INTO v_hist_id
  FROM public.load_status_history
  WHERE load_id = p_load_id
  ORDER BY changed_at DESC, created_at DESC
  LIMIT 1;

  IF v_hist_id IS NOT NULL THEN
    UPDATE public.load_status_history
    SET notes = v_note,
        change_source = 'manual_ui',
        changed_by = coalesce(changed_by, public.current_profile_id())
    WHERE id = v_hist_id;
  END IF;
END;
$function$
;

-- ---------------------------------------------------------------------------
-- EXECUTE grants, matched to each function's real caller.
-- ---------------------------------------------------------------------------

-- Trigger functions: PostgreSQL checks EXECUTE at CREATE TRIGGER time, never
-- when the trigger fires, so no client role has any reason to hold it.
REVOKE ALL ON FUNCTION public.clear_binder_pending_on_stage2_received() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.company_documents_set_version() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.company_documents_supersede_prior() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.company_settings_stamp_updated_by() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_load_stops_operator_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_loads_operator_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_broker_factoring_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_claim_flag_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_load_status_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_load_document_uploader() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stamp_broker_factoring_status_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stamp_document_exception_resolution() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stamp_facilities_actor() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_claim_flag_resolution() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_ica_completion_to_onboarding() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_inspection_doc_to_dot() FROM PUBLIC, anon, authenticated;

-- Internal helper. Called only from inside other SECURITY DEFINER bodies (which
-- run as the owner) and by no RLS policy, so no client role needs EXECUTE.
REVOKE ALL ON FUNCTION public.current_profile_id() FROM PUBLIC, anon, authenticated;

-- Signed-in RPCs. Each gates on the caller's role in its own body.
REVOKE ALL ON FUNCTION public.assign_load_driver(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_load_driver(uuid, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.unassign_load_driver(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unassign_load_driver(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.update_load_status(uuid, load_status, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_load_status(uuid, load_status, text) TO authenticated;
REVOKE ALL ON FUNCTION public.create_load_with_stops(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_load_with_stops(jsonb, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.check_driver_eligibility(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_driver_eligibility(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.check_driver_eligibility_bulk(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_driver_eligibility_bulk(uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.generate_load_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_load_number() TO authenticated;
REVOKE ALL ON FUNCTION public.manage_claim_flag(text, uuid, uuid, claim_flag_level, claim_type, text, text, numeric, text, text, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_claim_flag(text, uuid, uuid, claim_flag_level, claim_type, text, text, numeric, text, text, text, numeric, text) TO authenticated;

-- Staff/operator directory lookup: authenticated only, anon stays revoked.
REVOKE ALL ON FUNCTION public.get_staff_contact_info(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_staff_contact_info(uuid[]) TO authenticated;

-- Token-gated public endpoints. Unchanged surface, restated explicitly.
REVOKE ALL ON FUNCTION public.get_ica_review_link(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ica_review_link(text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.get_share_bundle_meta(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_share_bundle_meta(uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_application_draft(uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_application_draft(uuid, jsonb, text) TO anon, authenticated;