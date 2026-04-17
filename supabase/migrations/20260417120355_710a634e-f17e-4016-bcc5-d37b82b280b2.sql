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
  -- Only act when is_active goes from TRUE → FALSE
  IF NOT (OLD.is_active = TRUE AND NEW.is_active = FALSE) THEN
    RETURN NEW;
  END IF;

  -- 1. Reset dispatch status to not_dispatched and clear all operational state
  UPDATE public.active_dispatch
  SET
    dispatch_status     = 'not_dispatched',
    status_notes        = 'Automatically cleared on operator deactivation.',
    current_load_lane   = NULL,
    eta_redispatch      = NULL,
    assigned_dispatcher = NULL,
    updated_at          = now()
  WHERE operator_id = NEW.id;

  -- 2. Notify assigned onboarding coordinator
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

  INSERT INTO public.notifications (user_id, title, body, type, channel, link)
  VALUES (
    v_coordinator_id,
    'Driver deactivated — ' || v_operator_name,
    v_operator_name || ' has been deactivated and removed from the active roster. Their dispatch status has been reset to Not Dispatched.',
    'operator_deactivated',
    'in_app',
    '/staff?operator=' || NEW.id::text
  );

  RETURN NEW;
END;
$function$;

-- Backfill: clean dispatch rows for already-deactivated operators
UPDATE public.active_dispatch ad
SET
  dispatch_status     = 'not_dispatched',
  status_notes        = 'Automatically cleared on operator deactivation.',
  current_load_lane   = NULL,
  eta_redispatch      = NULL,
  assigned_dispatcher = NULL,
  updated_at          = now()
FROM public.operators o
WHERE ad.operator_id = o.id
  AND o.is_active = false
  AND ad.dispatch_status <> 'not_dispatched';