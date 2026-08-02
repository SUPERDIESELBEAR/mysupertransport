-- ---------------------------------------------------------------------------
-- Notification delivery must never revoke the work that triggered it.
--
-- Three things the next author needs to know:
--
-- 1. AFTER buys nothing. An AFTER trigger that raises aborts the statement
--    that fired it, exactly like a BEFORE trigger. Every notification insert
--    needs real isolation; being AFTER is not isolation.
--
-- 2. The `priority` column defaults to 'watch', so the functions that never
--    named it were not exposed to the 23514 check violation that started this.
--    The exposure being closed here is the general one: ANY refused insert
--    (23502 on a null recipient, 23514, a lock timeout) takes the transaction
--    with it.
--
-- 3. A plpgsql function with an EXCEPTION clause runs in its own
--    subtransaction. That is why try_notify() works as a helper: a failure
--    inside it is contained there and the caller's transaction survives.
--    Call sites therefore hold no raw INSERT INTO public.notifications.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.try_notify(
  p_user_id      uuid,
  p_type         text,
  p_title        text,
  p_body         text,
  p_link         text DEFAULT NULL,
  p_priority     text DEFAULT NULL,
  p_entity_type  text DEFAULT NULL,
  p_entity_id    uuid DEFAULT NULL,
  p_channel      text DEFAULT 'in_app',
  p_entity_label text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- A null recipient is a 23502 waiting to happen. Record it as an undelivered
  -- notification rather than letting it abort the caller.
  IF p_user_id IS NULL THEN
    PERFORM public.log_notification_delivery_failure(
      coalesce(p_title, p_type), coalesce(p_entity_type, 'unknown'), p_entity_id,
      p_entity_label, 'recipient is null', p_body, p_link);
    RETURN false;
  END IF;

  INSERT INTO public.notifications (
    user_id, type, title, body, link, channel, priority, entity_type, entity_id
  ) VALUES (
    p_user_id, p_type, p_title, p_body, p_link,
    coalesce(p_channel, 'in_app')::public.notification_channel,
    coalesce(p_priority, 'watch'), p_entity_type, p_entity_id
  );
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_notification_delivery_failure(
    coalesce(p_title, p_type), coalesce(p_entity_type, 'unknown'), p_entity_id,
    p_entity_label, SQLSTATE || ' ' || SQLERRM, p_body, p_link);
  RETURN false;
END;
$function$;

-- The outbound half. An email gateway hand-off that fails must not roll back a
-- driver's status change either.
CREATE OR REPLACE FUNCTION public.try_notify_http(
  p_url         text,
  p_bearer      text,
  p_body        jsonb,
  p_subject     text,
  p_entity_type text DEFAULT NULL,
  p_entity_id   uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  PERFORM net.http_post(
    url     := p_url,
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'Authorization', 'Bearer ' || p_bearer),
    body    := p_body
  );
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_notification_delivery_failure(
    p_subject, coalesce(p_entity_type, 'unknown'), p_entity_id, NULL,
    'outbound: ' || SQLSTATE || ' ' || SQLERRM, p_body::text, p_url);
  RETURN false;
END;
$function$;

REVOKE ALL ON FUNCTION public.try_notify(uuid, text, text, text, text, text, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.try_notify_http(text, text, jsonb, text, text, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. handle_operator_deactivated  (trigger on operators)
--    A failed coordinator notification must not undo the deactivation.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_operator_deactivated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_coordinator_id   UUID;
  v_operator_name    TEXT;
  v_app              RECORD;
BEGIN
  IF OLD.is_active = NEW.is_active THEN
    RETURN NEW;
  END IF;

  IF OLD.is_active = TRUE AND NEW.is_active = FALSE THEN
    NEW.deactivated_at := COALESCE(NEW.deactivated_at, now());
  ELSIF OLD.is_active = FALSE AND NEW.is_active = TRUE THEN
    NEW.deactivated_at := NULL;
    NEW.deactivation_reason := NULL;
    NEW.deactivated_by := NULL;
  END IF;

  IF NOT (OLD.is_active = TRUE AND NEW.is_active = FALSE) THEN
    RETURN NEW;
  END IF;

  UPDATE public.active_dispatch
  SET
    dispatch_status     = 'not_dispatched',
    status_notes        = 'Automatically cleared on operator deactivation.',
    current_load_lane   = NULL,
    eta_redispatch      = NULL,
    assigned_dispatcher = NULL,
    updated_at          = now()
  WHERE operator_id = NEW.id;

  v_coordinator_id := NEW.assigned_onboarding_staff;
  IF v_coordinator_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_operator_name := 'An operator';
  IF NEW.application_id IS NOT NULL THEN
    SELECT first_name, last_name INTO v_app
    FROM public.applications WHERE id = NEW.application_id;
    IF FOUND THEN
      v_operator_name := COALESCE(
        NULLIF(TRIM(COALESCE(v_app.first_name, '') || ' ' || COALESCE(v_app.last_name, '')), ''),
        'An operator'
      );
    END IF;
  END IF;

  PERFORM public.try_notify(
    v_coordinator_id,
    'operator_deactivated',
    'Driver deactivated — ' || v_operator_name,
    v_operator_name || ' has been deactivated and removed from the active roster. Their dispatch status has been reset to Not Dispatched.',
    '/staff?operator=' || NEW.id::text,
    NULL, 'operator', NEW.id, 'in_app', v_operator_name
  );

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. notify_driver_on_upload_status_change  (trigger on driver_uploads)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_driver_on_upload_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pref    BOOLEAN;
  v_title   TEXT;
  v_body    TEXT;
  v_fn_url  CONSTANT TEXT := 'https://qgxpkcudwjmacrdcyvhj.supabase.co/functions/v1/notify-upload-attention';
  v_anon    CONSTANT TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFneHBrY3Vkd2ptYWNyZGN5dmhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NDg3NDgsImV4cCI6MjA4ODQyNDc0OH0.LoP0_X7zPsOL4-GHQim1orOhlqk6znV6i-tGB7__66o';
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

  SELECT COALESCE(
    (SELECT in_app_enabled FROM public.notification_preferences
     WHERE user_id = NEW.driver_id AND event_type = 'document_update' LIMIT 1),
    TRUE
  ) INTO v_pref;

  IF NOT v_pref THEN RETURN NEW; END IF;

  IF NEW.status = 'reviewed' THEN
    v_title := 'Upload reviewed ✓';
    v_body  := 'Your uploaded document has been reviewed by your coordinator.';
  ELSIF NEW.status = 'needs_attention' THEN
    v_title := 'Upload needs attention';
    v_body  := 'Your coordinator flagged one of your uploaded documents — please check your binder.';
  ELSE
    RETURN NEW;
  END IF;

  PERFORM public.try_notify(
    NEW.driver_id, 'document_update', v_title, v_body,
    '/operator?tab=inspection-binder', NULL, 'driver_upload', NEW.id
  );

  IF NEW.status = 'needs_attention' THEN
    PERFORM public.try_notify_http(
      v_fn_url, v_anon,
      jsonb_build_object(
        'driver_user_id', NEW.driver_id::text,
        'file_name',      NEW.file_name,
        'category',       NEW.category::text
      ),
      'upload_needs_attention', 'driver_upload', NEW.id
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. notify_on_truck_down  (trigger on active_dispatch)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_truck_down()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_op            RECORD;
  v_app           RECORD;
  v_operator_name TEXT;
  v_unit          TEXT;
  v_recipient     RECORD;
BEGIN
  IF NEW.dispatch_status <> 'truck_down' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.dispatch_status = 'truck_down' THEN RETURN NEW; END IF;

  SELECT o.id, o.user_id, o.application_id, o.unit_number,
         o.assigned_onboarding_staff,
         os.unit_number AS os_unit_number
  INTO v_op
  FROM public.operators o
  LEFT JOIN public.onboarding_status os ON os.operator_id = o.id
  WHERE o.id = NEW.operator_id;

  IF NOT FOUND THEN RETURN NEW; END IF;

  v_unit := COALESCE(v_op.os_unit_number, v_op.unit_number, 'Unknown Unit');

  v_operator_name := 'An operator';
  IF v_op.application_id IS NOT NULL THEN
    SELECT first_name, last_name INTO v_app
    FROM public.applications WHERE id = v_op.application_id;
    IF FOUND THEN
      v_operator_name := COALESCE(
        NULLIF(TRIM(COALESCE(v_app.first_name, '') || ' ' || COALESCE(v_app.last_name, '')), ''),
        'An operator'
      );
    END IF;
  END IF;

  IF v_op.assigned_onboarding_staff IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE user_id = v_op.assigned_onboarding_staff
        AND type     = 'truck_down'
        AND read_at  IS NULL
        AND sent_at  > now() - interval '30 minutes'
        AND title    = 'Truck Down — ' || v_operator_name
    ) THEN
      PERFORM public.try_notify(
        v_op.assigned_onboarding_staff, 'truck_down',
        'Truck Down — ' || v_operator_name,
        v_operator_name || ' (Unit ' || v_unit || ') has reported a truck down.',
        '/staff?operator=' || NEW.operator_id::text,
        NULL, 'operator', NEW.operator_id, 'in_app', v_operator_name
      );
    END IF;
  END IF;

  FOR v_recipient IN
    SELECT DISTINCT
      ur.user_id,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = ur.user_id AND role = 'management'
        ) THEN '/management?view=operator-detail&op=' || NEW.operator_id::text
        ELSE '/dispatch?op=' || NEW.operator_id::text
      END AS nav_link
    FROM public.user_roles ur
    WHERE ur.role IN ('dispatcher', 'management')
      AND ur.user_id <> v_op.user_id
      AND ur.user_id IS DISTINCT FROM v_op.assigned_onboarding_staff
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.notifications
      WHERE user_id = v_recipient.user_id
        AND type     = 'truck_down'
        AND read_at  IS NULL
        AND sent_at  > now() - interval '30 minutes'
        AND title    = 'Truck Down — ' || v_operator_name
    ) THEN CONTINUE; END IF;

    PERFORM public.try_notify(
      v_recipient.user_id, 'truck_down',
      'Truck Down — ' || v_operator_name,
      v_operator_name || ' (Unit ' || v_unit || ') has reported a truck down.',
      v_recipient.nav_link,
      NULL, 'operator', NEW.operator_id, 'in_app', v_operator_name
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. notify_operators_on_fleet_share  (trigger on inspection_documents)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_operators_on_fleet_share()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_op RECORD;
BEGIN
  IF NOT (
    OLD.shared_with_fleet = false
    AND NEW.shared_with_fleet = true
    AND NEW.scope = 'company_wide'
  ) THEN
    RETURN NEW;
  END IF;

  FOR v_op IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role = 'operator'
  LOOP
    IF COALESCE(
      (SELECT in_app_enabled
       FROM public.notification_preferences
       WHERE user_id = v_op.user_id
         AND event_type = 'document_update'
       LIMIT 1),
      TRUE
    ) THEN
      PERFORM public.try_notify(
        v_op.user_id, 'document_update',
        'New company document: ' || NEW.name,
        'A company document has been added to your Inspection Binder. Tap to review it.',
        '/operator?tab=inspection-binder',
        NULL, 'inspection_document', NEW.id, 'in_app', NEW.name
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. notify_owner_on_pay_setup_submitted  (trigger on contractor_pay_setup)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_owner_on_pay_setup_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_op            RECORD;
  v_app           RECORD;
  v_operator_name TEXT;
  v_contractor_label TEXT;
  v_recipient     RECORD;
  v_fn_url        CONSTANT TEXT := 'https://qgxpkcudwjmacrdcyvhj.supabase.co/functions/v1/notify-pay-setup-submitted';
  v_anon_key      CONSTANT TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFneHBrY3Vkd2ptYWNyZGN5dmhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NDg3NDgsImV4cCI6MjA4ODQyNDc0OH0.LoP0_X7zPsOL4-GHQim1orOhlqk6znV6i-tGB7__66o';
BEGIN
  IF NEW.submitted_at IS NULL THEN RETURN NEW; END IF;
  IF NEW.terms_accepted IS NOT TRUE THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.submitted_at IS NOT NULL THEN RETURN NEW; END IF;

  SELECT o.id, o.user_id, o.application_id
  INTO v_op
  FROM public.operators o
  WHERE o.id = NEW.operator_id;

  IF NOT FOUND THEN RETURN NEW; END IF;

  v_operator_name := COALESCE(
    NULLIF(TRIM(COALESCE(NEW.legal_first_name,'') || ' ' || COALESCE(NEW.legal_last_name,'')), ''),
    'A driver'
  );

  IF v_op.application_id IS NOT NULL THEN
    SELECT first_name, last_name INTO v_app
    FROM public.applications WHERE id = v_op.application_id;
    IF FOUND THEN
      v_operator_name := COALESCE(
        NULLIF(TRIM(COALESCE(v_app.first_name,'') || ' ' || COALESCE(v_app.last_name,'')), ''),
        v_operator_name
      );
    END IF;
  END IF;

  v_contractor_label := CASE
    WHEN NEW.contractor_type = 'business' AND NEW.business_name IS NOT NULL AND TRIM(NEW.business_name) <> ''
      THEN 'Business (' || NEW.business_name || ')'
    WHEN NEW.contractor_type = 'business' THEN 'Business'
    ELSE 'Individual'
  END;

  FOR v_recipient IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role IN ('owner', 'management')
      AND COALESCE(
        (SELECT in_app_enabled FROM public.notification_preferences
         WHERE user_id = ur.user_id AND event_type = 'pay_setup_submitted' LIMIT 1),
        ur.role = 'owner'
      ) = TRUE
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.notifications
      WHERE user_id = v_recipient.user_id
        AND type    = 'pay_setup_submitted'
        AND link    = '/management?operator=' || NEW.operator_id::text
        AND sent_at > now() - interval '30 minutes'
    ) THEN CONTINUE; END IF;

    PERFORM public.try_notify(
      v_recipient.user_id, 'pay_setup_submitted',
      '💰 Pay setup ready — ' || v_operator_name,
      v_operator_name || ' submitted their Stage 8 Contractor Pay Setup as ' || v_contractor_label || '. Send the payroll setup link.',
      '/management?operator=' || NEW.operator_id::text,
      NULL, 'operator', NEW.operator_id, 'in_app', v_operator_name
    );
  END LOOP;

  PERFORM public.try_notify_http(
    v_fn_url, v_anon_key,
    jsonb_build_object(
      'operator_id', NEW.operator_id::text,
      'contractor_pay_setup_id', NEW.id::text
    ),
    'pay_setup_submitted', 'operator', NEW.operator_id
  );

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. notify_staff_on_docs_uploaded  (trigger on operator_documents)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_staff_on_docs_uploaded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_os            RECORD;
  v_op            RECORD;
  v_app           RECORD;
  v_operator_name TEXT;
  v_staff_id      UUID;
  v_all_covered   BOOLEAN := TRUE;
  v_doc_key       TEXT;
  v_requested     TEXT[] := '{}';
BEGIN
  SELECT form_2290, truck_title, truck_photos, truck_inspection
  INTO v_os
  FROM public.onboarding_status
  WHERE operator_id = NEW.operator_id;

  IF NOT FOUND THEN RETURN NEW; END IF;

  IF v_os.form_2290        = 'requested' THEN v_requested := array_append(v_requested, 'form_2290');        END IF;
  IF v_os.truck_title      = 'requested' THEN v_requested := array_append(v_requested, 'truck_title');      END IF;
  IF v_os.truck_photos     = 'requested' THEN v_requested := array_append(v_requested, 'truck_photos');     END IF;
  IF v_os.truck_inspection = 'requested' THEN v_requested := array_append(v_requested, 'truck_inspection'); END IF;

  IF array_length(v_requested, 1) IS NULL THEN RETURN NEW; END IF;

  FOREACH v_doc_key IN ARRAY v_requested LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.operator_documents
      WHERE operator_id = NEW.operator_id
        AND document_type::text = v_doc_key
    ) THEN
      v_all_covered := FALSE;
      EXIT;
    END IF;
  END LOOP;

  IF NOT v_all_covered THEN RETURN NEW; END IF;

  SELECT assigned_onboarding_staff, application_id
  INTO v_op
  FROM public.operators
  WHERE id = NEW.operator_id;

  IF v_op.assigned_onboarding_staff IS NULL THEN RETURN NEW; END IF;

  v_staff_id := v_op.assigned_onboarding_staff;

  v_operator_name := 'An operator';
  IF v_op.application_id IS NOT NULL THEN
    SELECT first_name, last_name INTO v_app
    FROM public.applications WHERE id = v_op.application_id;
    IF FOUND THEN
      v_operator_name := COALESCE(
        NULLIF(TRIM(COALESCE(v_app.first_name,'') || ' ' || COALESCE(v_app.last_name,'')), ''),
        'An operator'
      );
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id  = v_staff_id
      AND type     = 'docs_uploaded'
      AND link     = '/staff?operator=' || NEW.operator_id::text
      AND read_at  IS NULL
      AND sent_at  > now() - interval '24 hours'
  ) THEN RETURN NEW; END IF;

  PERFORM public.try_notify(
    v_staff_id, 'docs_uploaded',
    'Documents uploaded — ready for review',
    v_operator_name || ' has uploaded all requested documents.',
    '/staff?operator=' || NEW.operator_id::text,
    NULL, 'operator', NEW.operator_id, 'in_app', v_operator_name
  );

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7. notify_staff_on_osas_signed  (trigger on onboard_assignment_sheets)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_staff_on_osas_signed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_op            RECORD;
  v_app           RECORD;
  v_operator_name TEXT := 'A driver';
  v_recipient     UUID;
  v_recipients    UUID[] := '{}';
BEGIN
  IF NEW.status IS DISTINCT FROM 'signed'
     OR OLD.status = 'signed' THEN
    RETURN NEW;
  END IF;

  SELECT assigned_onboarding_staff, application_id
  INTO v_op
  FROM public.operators
  WHERE id = NEW.operator_id;

  IF v_op.application_id IS NOT NULL THEN
    SELECT first_name, last_name INTO v_app
    FROM public.applications WHERE id = v_op.application_id;
    IF FOUND THEN
      v_operator_name := COALESCE(
        NULLIF(TRIM(COALESCE(v_app.first_name,'') || ' ' || COALESCE(v_app.last_name,'')), ''),
        'A driver'
      );
    END IF;
  END IF;

  IF v_op.assigned_onboarding_staff IS NOT NULL THEN
    v_recipients := array_append(v_recipients, v_op.assigned_onboarding_staff);
  ELSE
    SELECT COALESCE(array_agg(DISTINCT user_id), '{}')
    INTO v_recipients
    FROM public.user_roles
    WHERE role IN ('onboarding_staff','management','owner');
  END IF;

  FOREACH v_recipient IN ARRAY v_recipients LOOP
    PERFORM public.try_notify(
      v_recipient, 'osas_signed',
      'OSAS signed by ' || v_operator_name,
      v_operator_name || ' signed the Onboard Systems Assignment Sheet' ||
        COALESCE(' (Unit ' || NEW.unit_number || ')', '') || '.',
      '/dashboard?view=drivers&operator=' || NEW.operator_id::text,
      NULL, 'operator', NEW.operator_id, 'in_app', v_operator_name
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 8. notify_staff_on_release_note  (trigger on release_notes)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_staff_on_release_note()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_staff RECORD;
  v_fn_url CONSTANT TEXT := 'https://qgxpkcudwjmacrdcyvhj.supabase.co/functions/v1/send-release-note';
  v_anon   CONSTANT TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFneHBrY3Vkd2ptYWNyZGN5dmhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NDg3NDgsImV4cCI6MjA4ODQyNDc0OH0.LoP0_X7zPsOL4-GHQim1orOhlqk6znV6i-tGB7__66o';
BEGIN
  FOR v_staff IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role IN ('onboarding_staff', 'dispatcher', 'management', 'owner')
  LOOP
    IF COALESCE(
      (SELECT in_app_enabled FROM public.notification_preferences
       WHERE user_id = v_staff.user_id AND event_type = 'release_note' LIMIT 1),
      TRUE
    ) THEN
      PERFORM public.try_notify(
        v_staff.user_id, 'release_note',
        '🆕 ' || NEW.title,
        NEW.body,
        '/management?view=whats-new',
        NULL, 'release_note', NEW.id, 'in_app', NEW.title
      );
    END IF;
  END LOOP;

  PERFORM public.try_notify_http(
    v_fn_url, v_anon,
    jsonb_build_object('release_note_id', NEW.id::text, 'title', NEW.title, 'body', NEW.body),
    'release_note', 'release_note', NEW.id
  );

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 9. notify_staff_on_return_receipt  (trigger on equipment_receipts)
--    The receipt row and the sheet's return_completed_at stamp are the real
--    work here; a notification failure must not revoke either.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_staff_on_return_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_op            RECORD;
  v_app           RECORD;
  v_operator_name TEXT := 'A driver';
  v_recipient     UUID;
  v_recipients    UUID[] := '{}';
BEGIN
  IF NEW.direction <> 'return' OR NEW.uploader_role <> 'driver' THEN
    RETURN NEW;
  END IF;

  IF NEW.sheet_id IS NOT NULL THEN
    UPDATE public.onboard_assignment_sheets
       SET return_completed_at = COALESCE(return_completed_at, now())
     WHERE id = NEW.sheet_id;
  ELSE
    UPDATE public.onboard_assignment_sheets
       SET return_completed_at = COALESCE(return_completed_at, now())
     WHERE operator_id = NEW.operator_id
       AND return_requested_at IS NOT NULL
       AND return_completed_at IS NULL;
  END IF;

  SELECT assigned_onboarding_staff, application_id
  INTO v_op
  FROM public.operators
  WHERE id = NEW.operator_id;

  IF v_op.application_id IS NOT NULL THEN
    SELECT first_name, last_name INTO v_app
    FROM public.applications WHERE id = v_op.application_id;
    IF FOUND THEN
      v_operator_name := COALESCE(
        NULLIF(TRIM(COALESCE(v_app.first_name,'') || ' ' || COALESCE(v_app.last_name,'')), ''),
        'A driver'
      );
    END IF;
  END IF;

  IF v_op.assigned_onboarding_staff IS NOT NULL THEN
    v_recipients := array_append(v_recipients, v_op.assigned_onboarding_staff);
  ELSE
    SELECT COALESCE(array_agg(DISTINCT user_id), '{}')
    INTO v_recipients
    FROM public.user_roles
    WHERE role IN ('onboarding_staff','management','owner');
  END IF;

  FOREACH v_recipient IN ARRAY v_recipients LOOP
    PERFORM public.try_notify(
      v_recipient, 'equipment_return_receipt',
      'Return receipt uploaded by ' || v_operator_name,
      v_operator_name || ' uploaded an equipment return receipt' ||
        COALESCE(' (tracking ' || NEW.tracking_number || ')', '') || '.',
      '/dashboard?view=drivers&operator=' || NEW.operator_id::text,
      NULL, 'operator', NEW.operator_id, 'in_app', v_operator_name
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 10. approve_application_correction  (RPC)
--     The applicant's signed corrections are already written to
--     public.applications by the time the staff notification runs. A refused
--     insert here used to discard the whole approval.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_application_correction(p_token text, p_signed_name text, p_signature_url text, p_meta jsonb)
RETURNS TABLE(request_id uuid, application_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_req RECORD;
  v_field RECORD;
  v_sql text;
  v_editable text[] := public._app_correction_editable_columns();
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
  v_ip inet;
BEGIN
  SELECT * INTO v_req
    FROM public.application_correction_requests
    WHERE token = p_token
    LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_token'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;
  IF v_req.expires_at < now() THEN
    UPDATE public.application_correction_requests SET status = 'expired' WHERE id = v_req.id;
    RAISE EXCEPTION 'expired';
  END IF;
  IF p_signed_name IS NULL OR length(trim(p_signed_name)) < 2 THEN
    RAISE EXCEPTION 'signature_required';
  END IF;

  BEGIN v_ip := (v_meta->>'signed_ip')::inet; EXCEPTION WHEN OTHERS THEN v_ip := NULL; END;

  FOR v_field IN
    SELECT f.field_path, f.new_value
    FROM public.application_correction_fields f
    WHERE f.request_id = v_req.id
  LOOP
    IF NOT (v_field.field_path = ANY(v_editable)) THEN CONTINUE; END IF;

    IF v_field.field_path IN ('endorsements','equipment_operated') THEN
      v_sql := format(
        'UPDATE public.applications SET %I = ARRAY(SELECT jsonb_array_elements_text($1)) WHERE id = $2',
        v_field.field_path
      );
      EXECUTE v_sql USING coalesce(v_field.new_value, '[]'::jsonb), v_req.application_id;
    ELSIF v_field.field_path = 'employers' THEN
      EXECUTE 'UPDATE public.applications SET employers = $1 WHERE id = $2'
        USING coalesce(v_field.new_value, '[]'::jsonb), v_req.application_id;
    ELSIF v_field.field_path IN (
      'cdl_10_years','employment_gaps','dot_accidents','moving_violations',
      'sap_process','dot_positive_test_past_2yr','dot_return_to_duty_docs'
    ) THEN
      v_sql := format('UPDATE public.applications SET %I = ($1)::boolean WHERE id = $2', v_field.field_path);
      EXECUTE v_sql USING (v_field.new_value #>> '{}'), v_req.application_id;
    ELSIF v_field.field_path IN ('dob','cdl_expiration','medical_cert_expiration') THEN
      v_sql := format('UPDATE public.applications SET %I = nullif(($1),'''')::date WHERE id = $2', v_field.field_path);
      EXECUTE v_sql USING (v_field.new_value #>> '{}'), v_req.application_id;
    ELSE
      v_sql := format('UPDATE public.applications SET %I = ($1) WHERE id = $2', v_field.field_path);
      EXECUTE v_sql USING (v_field.new_value #>> '{}'), v_req.application_id;
    END IF;
  END LOOP;

  UPDATE public.application_correction_requests SET
    status = 'approved',
    responded_at = now(),
    signed_typed_name = trim(p_signed_name),
    signature_image_url = p_signature_url,
    signed_ip = v_ip,
    signed_user_agent = nullif(v_meta->>'signed_user_agent','')
  WHERE id = v_req.id;

  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (NULL, trim(p_signed_name), 'application_correction_approved', 'application',
          v_req.application_id, trim(p_signed_name),
          jsonb_build_object('request_id', v_req.id, 'signed_ip', v_ip::text));

  -- Isolated. try_notify also handles a null requested_by_staff_id by logging
  -- the undelivered notification instead of raising 23502 on the approval.
  PERFORM public.try_notify(
    v_req.requested_by_staff_id, 'application_correction_response',
    'Correction approved ✓',
    trim(p_signed_name) || ' approved your requested corrections to their application.',
    '/management?application=' || v_req.application_id::text,
    NULL, 'application', v_req.application_id, 'in_app', trim(p_signed_name)
  );

  request_id := v_req.id;
  application_id := v_req.application_id;
  RETURN NEXT;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 11. reject_application_correction  (RPC)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_application_correction(p_token text, p_reason text, p_meta jsonb)
RETURNS TABLE(request_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_req RECORD;
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
  v_ip inet;
BEGIN
  SELECT * INTO v_req
    FROM public.application_correction_requests
    WHERE token = p_token LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_token'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;

  BEGIN v_ip := (v_meta->>'signed_ip')::inet; EXCEPTION WHEN OTHERS THEN v_ip := NULL; END;

  UPDATE public.application_correction_requests SET
    status = 'rejected',
    responded_at = now(),
    rejection_reason = nullif(trim(coalesce(p_reason,'')),''),
    signed_ip = v_ip,
    signed_user_agent = nullif(v_meta->>'signed_user_agent','')
  WHERE id = v_req.id;

  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (NULL, 'Applicant', 'application_correction_rejected', 'application',
          v_req.application_id, v_req.application_id::text,
          jsonb_build_object('request_id', v_req.id, 'reason', p_reason, 'signed_ip', v_ip::text));

  PERFORM public.try_notify(
    v_req.requested_by_staff_id, 'application_correction_response',
    'Correction rejected',
    'The applicant rejected your requested corrections.' ||
      coalesce(' Reason: ' || nullif(trim(coalesce(p_reason,'')),''), ''),
    '/management?application=' || v_req.application_id::text,
    NULL, 'application', v_req.application_id
  );

  request_id := v_req.id;
  RETURN NEXT;
END;
$function$;
