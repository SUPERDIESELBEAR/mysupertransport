CREATE OR REPLACE FUNCTION public.assign_load_driver(
  p_load_id uuid,
  p_operator_id uuid,
  p_override_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_mgmt boolean;
  v_is_disp boolean;
  v_reason text := nullif(btrim(coalesce(p_override_reason, '')), '');
  v_elig jsonb;
  v_block jsonb;
  v_warn jsonb;
  v_status load_status;
  v_auto boolean := false;
  v_setting boolean;
  v_hist_id uuid;
  v_msgs text;
  v_profile uuid := public.current_profile_id();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_is_mgmt := public.has_role(v_uid, 'management') OR public.has_role(v_uid, 'owner');
  v_is_disp := public.has_role(v_uid, 'dispatcher');

  IF NOT (v_is_mgmt OR v_is_disp) THEN
    RAISE EXCEPTION 'You do not have permission to assign drivers to loads';
  END IF;

  SELECT status INTO v_status FROM public.loads WHERE id = p_load_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Load not found';
  END IF;

  v_elig := public.check_driver_eligibility(p_operator_id);
  v_block := v_elig -> 'blocking';
  v_warn := v_elig -> 'warnings';

  IF jsonb_array_length(v_block) > 0 THEN
    SELECT string_agg(e ->> 'message', '; ') INTO v_msgs
      FROM jsonb_array_elements(v_block) e;

    IF v_reason IS NULL THEN
      RAISE EXCEPTION 'Driver is not eligible: %', v_msgs;
    END IF;

    IF NOT v_is_mgmt THEN
      RAISE EXCEPTION 'Management approval is required to override: %', v_msgs;
    END IF;
  END IF;

  SELECT (setting_value)::text = 'true' INTO v_setting
    FROM public.company_settings WHERE setting_key = 'auto_cover_on_assignment';
  v_setting := COALESCE(v_setting, true);

  UPDATE public.loads
     SET operator_id = p_operator_id,
         updated_by = v_profile
   WHERE id = p_load_id;

  IF v_setting AND v_status = 'available' THEN
    UPDATE public.loads SET status = 'covered' WHERE id = p_load_id;
    v_auto := true;

    SELECT id INTO v_hist_id
      FROM public.load_status_history
     WHERE load_id = p_load_id
     ORDER BY changed_at DESC, created_at DESC
     LIMIT 1;

    IF v_hist_id IS NOT NULL THEN
      UPDATE public.load_status_history
         SET change_source = 'auto_assignment',
             notes = 'Status advanced automatically on driver assignment.'
                     || COALESCE(' Override reason: ' || v_reason, ''),
             changed_by = COALESCE(changed_by, v_profile)
       WHERE id = v_hist_id;
    END IF;
  END IF;

  IF v_reason IS NOT NULL AND jsonb_array_length(v_block) > 0 THEN
    INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
    VALUES (
      v_uid,
      public._audit_actor_name(v_uid),
      'load_driver_assignment_override',
      'load',
      p_load_id,
      (SELECT load_number FROM public.loads WHERE id = p_load_id),
      jsonb_build_object(
        'operator_id', p_operator_id,
        'failed_checks', v_block,
        'override_reason', v_reason,
        'actor_profile_id', v_profile
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'auto_advanced', v_auto,
    'warnings', v_warn
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_load_driver(uuid, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.assign_load_driver(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.unassign_load_driver(
  p_load_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE EXECUTE ON FUNCTION public.unassign_load_driver(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.unassign_load_driver(uuid, text) TO authenticated;