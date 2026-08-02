-- ============================================================================
-- 1. A shared, durable sink for notification-delivery failures.
--
-- The failing path is an INSERT into public.notifications, so notifications
-- cannot be the only record of its own failure. audit_log is the durable
-- record; the management bell is attempted too, nested and non-fatal, because
-- it is the surface a human actually watches. RAISE WARNING alone is invisible
-- under ten-minute log retention.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.log_notification_delivery_failure(
  p_subject      text,
  p_entity_type  text,
  p_entity_id    uuid,
  p_entity_label text,
  p_error        text,
  p_body         text,
  p_link         text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  INSERT INTO public.audit_log (action, entity_type, entity_id, entity_label, metadata)
  VALUES (
    'notification_delivery_failed',
    coalesce(p_entity_type, 'unknown'),
    p_entity_id,
    p_entity_label,
    jsonb_build_object(
      'subject', p_subject,
      'error', left(coalesce(p_error, ''), 500),
      'owed_at', now(),
      'body', left(coalesce(p_body, ''), 500),
      'link', p_link
    )
  );

  -- Best effort: if the bell is what broke, the audit row above still stands.
  BEGIN
    INSERT INTO public.notifications (user_id, type, title, body, link, priority, entity_type, entity_id)
    SELECT ur.user_id,
           'system_delivery_failure',
           'A notification could not be delivered',
           coalesce(p_body, p_subject),
           coalesce(p_link, '/dashboard'),
           'action',
           coalesce(p_entity_type, 'unknown'),
           p_entity_id
      FROM public.user_roles ur
     WHERE ur.role IN ('management', 'owner');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$function$;

REVOKE ALL ON FUNCTION public.log_notification_delivery_failure(text, text, uuid, text, text, text, text) FROM PUBLIC;

-- ============================================================================
-- 2. notify_driver_equipment_sheet_ready
--
-- Wrote priority 'high', which notifications_priority_check refuses. As a
-- BEFORE UPDATE trigger on onboarding_status it aborted the coordinator's
-- *_verified_at write along with the notification, and because the latch is
-- set AFTER the insert the abort also discarded the latch, so every later
-- verification touch on that driver would fail the same way.
--
-- Now: delivery is isolated, the latch is set unconditionally so the trigger
-- can never re-arm, and a failed delivery is recorded where a human sees it.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_driver_equipment_sheet_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_user_id uuid;
  v_all_verified boolean;
  v_any_assigned boolean;
  v_pref_enabled boolean;
  v_delivered boolean := true;
  v_err text;
  v_label text;
BEGIN
  IF NOT (
       NEW.eld_verified_at       IS DISTINCT FROM OLD.eld_verified_at
    OR NEW.dash_cam_verified_at  IS DISTINCT FROM OLD.dash_cam_verified_at
    OR NEW.bestpass_verified_at  IS DISTINCT FROM OLD.bestpass_verified_at
    OR NEW.fuel_card_verified_at IS DISTINCT FROM OLD.fuel_card_verified_at
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.eld_signature_signed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_any_assigned := (
       COALESCE(NEW.eld_assignment_state, 'not_assigned')       <> 'not_assigned'
    OR COALESCE(NEW.dash_cam_assignment_state, 'not_assigned')  <> 'not_assigned'
    OR COALESCE(NEW.bestpass_assignment_state, 'not_assigned')  <> 'not_assigned'
    OR COALESCE(NEW.fuel_card_assignment_state, 'not_assigned') <> 'not_assigned'
  );

  v_all_verified := (
        (COALESCE(NEW.eld_assignment_state,'not_assigned')       = 'not_assigned' OR NEW.eld_verified_at       IS NOT NULL)
    AND (COALESCE(NEW.dash_cam_assignment_state,'not_assigned')  = 'not_assigned' OR NEW.dash_cam_verified_at  IS NOT NULL)
    AND (COALESCE(NEW.bestpass_assignment_state,'not_assigned')  = 'not_assigned' OR NEW.bestpass_verified_at  IS NOT NULL)
    AND (COALESCE(NEW.fuel_card_assignment_state,'not_assigned') = 'not_assigned' OR NEW.fuel_card_verified_at IS NOT NULL)
  );

  IF NOT v_all_verified OR NOT v_any_assigned THEN
    IF NEW.equipment_asset_sheet_ready_notified_at IS NOT NULL THEN
      NEW.equipment_asset_sheet_ready_notified_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.equipment_asset_sheet_ready_notified_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT o.user_id INTO v_user_id FROM public.operators o WHERE o.id = NEW.operator_id;
  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(
    (SELECT in_app_enabled FROM public.notification_preferences
     WHERE user_id = v_user_id AND event_type = 'onboarding_update' LIMIT 1),
    TRUE
  ) INTO v_pref_enabled;

  IF v_pref_enabled THEN
    BEGIN
      INSERT INTO public.notifications (user_id, title, body, type, channel, link, priority)
      VALUES (
        v_user_id,
        'Equipment Asset Sheet ready to sign',
        'Your coordinator verified all of your equipment. Tap to review and sign your Owner Operator Equipment Receipt Acknowledgment.',
        'onboarding_update',
        'in_app',
        '/operator/my-truck?focus=equipment-sheet',
        'action'
      );
    EXCEPTION WHEN OTHERS THEN
      v_delivered := false;
      v_err := SQLSTATE || ': ' || SQLERRM;
    END;
  END IF;

  -- Unconditional: the trigger records the OUTCOME, not the attempt, so it can
  -- never re-arm and take a later verification save down with it.
  NEW.equipment_asset_sheet_ready_notified_at := now();

  IF NOT v_delivered THEN
    SELECT nullif(btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), '')
      INTO v_label
      FROM public.profiles p WHERE p.user_id = v_user_id;

    PERFORM public.log_notification_delivery_failure(
      'equipment_asset_sheet_ready',
      'operator',
      NEW.operator_id,
      v_label,
      v_err,
      coalesce(v_label, 'A driver')
        || ' was not told their Equipment Asset Sheet is ready to sign.',
      '/dashboard?view=operator-detail&op=' || NEW.operator_id::text
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================================================
-- 3. notify_rods_correction_request — isolation only; priorities already legal.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_rods_correction_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_user_id uuid;
  v_driver_name text;
  v_err text;
BEGIN
  SELECT o.user_id INTO v_user_id FROM public.operators o WHERE o.id = NEW.operator_id;

  SELECT nullif(btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), '')
    INTO v_driver_name
    FROM public.profiles p WHERE p.user_id = v_user_id;

  IF TG_OP = 'INSERT' THEN
    IF v_user_id IS NOT NULL THEN
      BEGIN
        INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id, priority)
        VALUES (
          v_user_id,
          'rods_correction_requested',
          'Log correction requested',
          'The office asked you to look at your log for ' || to_char(NEW.log_date, 'Mon FMDD, YYYY') || '.',
          '/operator?view=paper-logs&date=' || NEW.log_date::text,
          'rods_correction_request', NEW.id, 'action'
        );
      EXCEPTION WHEN OTHERS THEN
        v_err := SQLSTATE || ': ' || SQLERRM;
        PERFORM public.log_notification_delivery_failure(
          'rods_correction_requested', 'rods_correction_request', NEW.id, v_driver_name, v_err,
          coalesce(v_driver_name, 'The driver') || ' was not told about the log correction requested for '
            || to_char(NEW.log_date, 'Mon FMDD, YYYY') || '.',
          '/management?view=eld-logs&op=' || NEW.operator_id::text || '&date=' || NEW.log_date::text
        );
      END;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('actioned','declined')
     AND NEW.requested_by IS NOT NULL THEN
    BEGIN
      INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id, priority)
      VALUES (
        NEW.requested_by,
        'rods_correction_resolved',
        CASE WHEN NEW.status = 'actioned' THEN 'Log correction actioned' ELSE 'Log correction declined' END,
        coalesce(v_driver_name, 'The driver')
          || CASE WHEN NEW.status = 'actioned'
                  THEN ' re-certified the log for '
                  ELSE ' declined the correction request for ' END
          || to_char(NEW.log_date, 'Mon FMDD, YYYY') || '.',
        '/management?view=eld-logs&op=' || NEW.operator_id::text || '&date=' || NEW.log_date::text,
        'rods_correction_request', NEW.id, 'watch'
      );
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLSTATE || ': ' || SQLERRM;
      PERFORM public.log_notification_delivery_failure(
        'rods_correction_resolved', 'rods_correction_request', NEW.id, v_driver_name, v_err,
        'The staff member who raised the correction for ' || to_char(NEW.log_date, 'Mon FMDD, YYYY')
          || ' was not told it was ' || NEW.status || '.',
        '/management?view=eld-logs&op=' || NEW.operator_id::text || '&date=' || NEW.log_date::text
      );
    END;
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================================================
-- 4. eld_sync_alerts: an alert nobody can attribute must still reach someone.
--    operator_id becomes nullable (explicit NULL is the orphan marker, '' is
--    an error on the client), and raised_by records auth.uid() so an
--    unattributable alert is still traceable to a session.
-- ============================================================================
ALTER TABLE public.eld_sync_alerts
  ALTER COLUMN operator_id DROP NOT NULL;

ALTER TABLE public.eld_sync_alerts
  ADD COLUMN IF NOT EXISTS raised_by uuid;

CREATE OR REPLACE FUNCTION public.raise_eld_sync_alert(
  p_operator_id uuid,
  p_kind text,
  p_log_date date,
  p_detail text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_allowed boolean;
  v_alert_id uuid;
  v_created boolean := false;
  v_unit text;
  v_title text;
  v_is_demo boolean := false;
  v_err text;
BEGIN
  IF p_operator_id IS NULL THEN
    -- Unattributable: the condition is real, the owner is not resolvable.
    -- Ownership cannot be checked, so a signed-in session is the floor.
    v_allowed := v_uid IS NOT NULL;
  ELSE
    v_allowed := coalesce(public.is_own_rods_operator(p_operator_id), false)
              OR coalesce(public.is_staff(v_uid), false);
  END IF;

  IF v_allowed IS NOT TRUE THEN
    RAISE EXCEPTION 'not authorized to raise a sync alert for this operator';
  END IF;

  IF coalesce(p_kind, '') = '' THEN
    RAISE EXCEPTION 'alert kind is required';
  END IF;

  IF p_operator_id IS NOT NULL THEN
    SELECT coalesce(o.is_demo, false), o.unit_number
      INTO v_is_demo, v_unit
      FROM public.operators o
     WHERE o.id = p_operator_id;
  END IF;

  UPDATE public.eld_sync_alerts
     SET last_seen_at = now(),
         occurrences = occurrences + 1,
         detail = coalesce(p_detail, detail)
   WHERE operator_id IS NOT DISTINCT FROM p_operator_id
     AND kind = p_kind
     AND coalesce(log_date, DATE '1900-01-01') = coalesce(p_log_date, DATE '1900-01-01')
     AND acknowledged_at IS NULL
   RETURNING id INTO v_alert_id;

  IF v_alert_id IS NULL THEN
    INSERT INTO public.eld_sync_alerts (kind, operator_id, log_date, detail, is_demo, raised_by)
    VALUES (p_kind, p_operator_id, p_log_date, coalesce(p_detail, ''), v_is_demo, v_uid)
    RETURNING id INTO v_alert_id;
    v_created := true;
  END IF;

  -- Demo: record the alert, reach nobody.
  IF v_created AND v_is_demo IS NOT TRUE THEN
    v_title := 'ELD sync: ' || replace(p_kind, '_', ' ')
      || CASE WHEN p_operator_id IS NULL
              THEN ' — driver unknown'
              ELSE coalesce(' — Unit ' || v_unit, '') END
      || coalesce(' — ' || to_char(p_log_date, 'YYYY-MM-DD'), '');

    -- Delivery is isolated: a refused notification must not roll back the
    -- alert row, and previously it rolled back the whole function.
    BEGIN
      INSERT INTO public.notifications (user_id, type, title, body, link, priority, entity_type, entity_id)
      SELECT ur.user_id,
             'eld_sync_alert',
             v_title,
             coalesce(p_detail, ''),
             CASE WHEN p_operator_id IS NULL
                  THEN '/management?view=eld-logs'
                  ELSE '/dashboard?view=operator-detail&op=' || p_operator_id::text END,
             'action',
             'eld_sync_alert',
             v_alert_id
        FROM public.user_roles ur
       WHERE ur.role IN ('management', 'owner');
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLSTATE || ': ' || SQLERRM;
      PERFORM public.log_notification_delivery_failure(
        'eld_sync_alert', 'eld_sync_alert', v_alert_id, v_unit, v_err,
        v_title, '/management?view=eld-logs'
      );
    END;
  END IF;

  RETURN v_alert_id;
END;
$function$;

-- ============================================================================
-- 5. record_rods_unlock — already isolated, but its EXCEPTION branch only
--    warned. Same silent-loss shape; add the durable sink.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_rods_unlock(p_operator_id uuid, p_rods_day_id uuid, p_log_date date, p_unlocked_at timestamp with time zone, p_local_certified_at timestamp with time zone, p_cancelled_entry_ids jsonb, p_cancelled_states jsonb, p_reason text, p_device_info text, p_idempotency_key uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_id uuid;
  v_unit text;
  v_sent integer := 0;
  v_err text;
BEGIN
  IF coalesce(public.is_own_rods_operator(p_operator_id), false) IS TRUE THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF coalesce(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A written reason naming the office authorization is required.'
      USING ERRCODE = 'P0090';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'An idempotency key is required.' USING ERRCODE = 'P0091';
  END IF;

  SELECT id INTO v_id FROM public.rods_unlock_events
   WHERE idempotency_key = p_idempotency_key;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.rods_unlock_events (
    operator_id, rods_day_id, log_date, unlocked_at, local_certified_at,
    cancelled_entry_ids, cancelled_states, reason, device_info, idempotency_key
  ) VALUES (
    p_operator_id, p_rods_day_id, p_log_date,
    coalesce(p_unlocked_at, now()), p_local_certified_at,
    coalesce(p_cancelled_entry_ids, '[]'::jsonb),
    coalesce(p_cancelled_states, '{}'::jsonb),
    btrim(p_reason), p_device_info, p_idempotency_key
  )
  RETURNING id INTO v_id;

  SELECT unit_number INTO v_unit FROM public.operators WHERE id = p_operator_id;

  BEGIN
    INSERT INTO public.notifications (user_id, type, title, body, link, priority, entity_type, entity_id)
    SELECT ur.user_id,
           'eld_log_unlocked',
           'ELD log unlocked' || coalesce(' — Unit ' || v_unit, '')
             || ' — ' || to_char(p_log_date, 'YYYY-MM-DD'),
           'A signed log was returned to draft on the driver device with office authorization: '
             || btrim(p_reason),
           '/dashboard?view=operator-detail&op=' || p_operator_id::text,
           'action',
           'rods_unlock_event',
           v_id
      FROM public.user_roles ur
     WHERE ur.role IN ('management', 'owner');

    GET DIAGNOSTICS v_sent = ROW_COUNT;

    IF v_sent = 0 THEN
      UPDATE public.rods_unlock_events
         SET notification_state = 'no_recipients',
             notification_error = 'No management or owner recipients were found.'
       WHERE id = v_id;
      PERFORM public.log_notification_delivery_failure(
        'eld_log_unlocked', 'rods_unlock_event', v_id, v_unit,
        'No management or owner recipients were found.',
        'An ELD log unlock on ' || to_char(p_log_date, 'YYYY-MM-DD') || ' reached no one.',
        '/dashboard?view=operator-detail&op=' || p_operator_id::text
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLSTATE || ': ' || SQLERRM;
    UPDATE public.rods_unlock_events
       SET notification_state = 'failed',
           notification_error = left(v_err, 500)
     WHERE id = v_id;
    PERFORM public.log_notification_delivery_failure(
      'eld_log_unlocked', 'rods_unlock_event', v_id, v_unit, v_err,
      'An ELD log unlock on ' || to_char(p_log_date, 'YYYY-MM-DD') || ' was recorded but reached no one.',
      '/dashboard?view=operator-detail&op=' || p_operator_id::text
    );
  END;

  RETURN v_id;
END;
$function$;