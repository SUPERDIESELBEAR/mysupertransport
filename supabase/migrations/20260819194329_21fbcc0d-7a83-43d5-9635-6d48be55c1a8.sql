-- 1. Company settings ---------------------------------------------------------
CREATE TABLE public.company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text NOT NULL UNIQUE,
  setting_value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

GRANT SELECT, UPDATE ON public.company_settings TO authenticated;
GRANT ALL ON public.company_settings TO service_role;

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read company settings"
  ON public.company_settings FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'dispatcher')
    OR public.has_role(auth.uid(), 'onboarding_staff')
  );

CREATE POLICY "Management can update company settings"
  ON public.company_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE TRIGGER company_settings_set_updated_at
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.company_settings_stamp_updated_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_by := COALESCE(public.current_profile_id(), OLD.updated_by);
  RETURN NEW;
END;
$$;

CREATE TRIGGER company_settings_stamp_updated_by
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.company_settings_stamp_updated_by();

INSERT INTO public.company_settings (setting_key, setting_value, description)
VALUES (
  'auto_cover_on_assignment',
  'true'::jsonb,
  'When enabled, assigning a driver to a load in available status automatically advances it to covered, and unassigning a driver from a covered load returns it to available. Carriers with a separate brokerage or load-planning team may prefer this disabled so assignment and status progression stay independent.'
);

-- 2. Eligibility ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_driver_eligibility(p_operator_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'America/Chicago')::date;
  v_op record;
  v_block jsonb := '[]'::jsonb;
  v_warn jsonb := '[]'::jsonb;
  v_cdl date;
  v_med date;
  v_reg date;
  v_dot date;
  v_other text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (public.has_role(v_uid, 'dispatcher')
          OR public.has_role(v_uid, 'management')
          OR public.has_role(v_uid, 'owner')) THEN
    RAISE EXCEPTION 'You do not have permission to check driver eligibility';
  END IF;

  SELECT o.id, o.user_id, o.is_active, o.on_hold, o.on_hold_reason,
         o.excluded_from_dispatch, o.excluded_from_dispatch_reason,
         a.cdl_expiration, a.medical_cert_expiration
    INTO v_op
    FROM public.operators o
    LEFT JOIN public.applications a ON a.id = o.application_id
   WHERE o.id = p_operator_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver not found';
  END IF;

  SELECT d.expires_at INTO v_cdl
    FROM public.inspection_documents d
   WHERE d.scope = 'per_driver' AND d.driver_id = v_op.user_id AND d.name = 'CDL (Front)'
   ORDER BY d.expires_at DESC NULLS LAST LIMIT 1;
  v_cdl := COALESCE(v_cdl, v_op.cdl_expiration);

  SELECT d.expires_at INTO v_med
    FROM public.inspection_documents d
   WHERE d.scope = 'per_driver' AND d.driver_id = v_op.user_id AND d.name = 'Medical Certificate'
   ORDER BY d.expires_at DESC NULLS LAST LIMIT 1;
  v_med := COALESCE(v_med, v_op.medical_cert_expiration);

  SELECT d.expires_at INTO v_reg
    FROM public.inspection_documents d
   WHERE d.scope = 'per_driver' AND d.driver_id = v_op.user_id
     AND d.name = 'IRP Registration (cab card)'
   ORDER BY d.expires_at DESC NULLS LAST LIMIT 1;

  SELECT max(t.next_due_date) INTO v_dot
    FROM public.truck_dot_inspections t
   WHERE t.operator_id = p_operator_id;

  -- Status blocks
  IF v_op.is_active IS NOT TRUE THEN
    v_block := v_block || jsonb_build_object('code','inactive','message','Driver is not active');
  END IF;

  IF v_op.excluded_from_dispatch IS TRUE THEN
    v_block := v_block || jsonb_build_object(
      'code','excluded_from_dispatch',
      'message','Driver is excluded from dispatch'
        || COALESCE(' — ' || nullif(btrim(v_op.excluded_from_dispatch_reason), ''), ''));
  END IF;

  IF v_op.on_hold IS TRUE THEN
    v_block := v_block || jsonb_build_object(
      'code','on_hold',
      'message','Driver is on hold'
        || COALESCE(' — ' || nullif(btrim(v_op.on_hold_reason), ''), ''));
  END IF;

  -- Document blocks / warnings
  IF v_cdl IS NULL THEN
    v_warn := v_warn || jsonb_build_object('code','cdl_missing','message','No CDL expiration date on file');
  ELSIF v_cdl < v_today THEN
    v_block := v_block || jsonb_build_object('code','cdl_expired',
      'message','CDL expired on ' || to_char(v_cdl, 'FMMonth FMDD, YYYY'));
  ELSIF v_cdl <= v_today + 14 THEN
    v_warn := v_warn || jsonb_build_object('code','cdl_expiring',
      'message','CDL expires on ' || to_char(v_cdl, 'FMMonth FMDD, YYYY'));
  END IF;

  IF v_med IS NULL THEN
    v_warn := v_warn || jsonb_build_object('code','medical_missing','message','No medical card expiration date on file');
  ELSIF v_med < v_today THEN
    v_block := v_block || jsonb_build_object('code','medical_expired',
      'message','Medical card expired on ' || to_char(v_med, 'FMMonth FMDD, YYYY'));
  ELSIF v_med <= v_today + 14 THEN
    v_warn := v_warn || jsonb_build_object('code','medical_expiring',
      'message','Medical card expires on ' || to_char(v_med, 'FMMonth FMDD, YYYY'));
  END IF;

  IF v_dot IS NULL THEN
    v_warn := v_warn || jsonb_build_object('code','dot_missing','message','No annual DOT inspection on file');
  ELSIF v_dot < v_today THEN
    v_block := v_block || jsonb_build_object('code','dot_expired',
      'message','Annual DOT inspection expired on ' || to_char(v_dot, 'FMMonth FMDD, YYYY'));
  ELSIF v_dot <= v_today + 14 THEN
    v_warn := v_warn || jsonb_build_object('code','dot_expiring',
      'message','Annual DOT inspection is due ' || to_char(v_dot, 'FMMonth FMDD, YYYY'));
  END IF;

  IF v_reg IS NULL THEN
    v_warn := v_warn || jsonb_build_object('code','registration_missing','message','No truck registration expiration date on file');
  ELSIF v_reg < v_today THEN
    v_block := v_block || jsonb_build_object('code','registration_expired',
      'message','Truck registration expired on ' || to_char(v_reg, 'FMMonth FMDD, YYYY'));
  ELSIF v_reg <= v_today + 14 THEN
    v_warn := v_warn || jsonb_build_object('code','registration_expiring',
      'message','Truck registration expires on ' || to_char(v_reg, 'FMMonth FMDD, YYYY'));
  END IF;

  SELECT string_agg(l.load_number, ', ' ORDER BY l.load_number) INTO v_other
    FROM public.loads l
   WHERE l.operator_id = p_operator_id
     AND l.status IN ('available','covered','dispatched','in_transit','at_delivery');

  IF v_other IS NOT NULL THEN
    v_warn := v_warn || jsonb_build_object('code','active_load',
      'message','Driver is already assigned to ' || v_other);
  END IF;

  RETURN jsonb_build_object(
    'operator_id', p_operator_id,
    'eligible', jsonb_array_length(v_block) = 0,
    'blocking', v_block,
    'warnings', v_warn
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_driver_eligibility(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.check_driver_eligibility(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.check_driver_eligibility_bulk(p_operator_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_out jsonb := '{}'::jsonb;
BEGIN
  IF p_operator_ids IS NULL THEN
    RETURN v_out;
  END IF;
  FOREACH v_id IN ARRAY p_operator_ids LOOP
    v_out := v_out || jsonb_build_object(v_id::text, public.check_driver_eligibility(v_id));
  END LOOP;
  RETURN v_out;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_driver_eligibility_bulk(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.check_driver_eligibility_bulk(uuid[]) TO authenticated;

-- 3. Assignment ----------------------------------------------------------------
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
      public._audit_actor_name(),
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
    public._audit_actor_name(),
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