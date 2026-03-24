
-- Function: fires when operators.is_active flips true → false
CREATE OR REPLACE FUNCTION public.handle_operator_deactivated()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_coordinator_id   UUID;
  v_operator_name    TEXT;
  v_app              RECORD;
BEGIN
  -- Only act when is_active goes from TRUE → FALSE
  IF NOT (OLD.is_active = TRUE AND NEW.is_active = FALSE) THEN
    RETURN NEW;
  END IF;

  -- 1. Reset dispatch status to not_dispatched
  UPDATE public.active_dispatch
  SET
    dispatch_status = 'not_dispatched',
    status_notes    = 'Automatically cleared on operator deactivation.',
    current_load_lane = NULL,
    eta_redispatch  = NULL,
    updated_at      = now()
  WHERE operator_id = NEW.id;

  -- 2. Notify assigned onboarding coordinator
  v_coordinator_id := NEW.assigned_onboarding_staff;
  IF v_coordinator_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve operator display name
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

  -- Insert in-app notification for the coordinator
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
$$;

-- Attach trigger to operators table
DROP TRIGGER IF EXISTS on_operator_deactivated ON public.operators;
CREATE TRIGGER on_operator_deactivated
  AFTER UPDATE OF is_active ON public.operators
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_operator_deactivated();
