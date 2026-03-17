
-- Function: fire in-app notifications to all operators when a company doc is shared with fleet
CREATE OR REPLACE FUNCTION public.notify_operators_on_fleet_share()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_op RECORD;
BEGIN
  -- Only act when shared_with_fleet flips from false → true on a company-wide doc
  IF NOT (
    OLD.shared_with_fleet = false
    AND NEW.shared_with_fleet = true
    AND NEW.scope = 'company_wide'
  ) THEN
    RETURN NEW;
  END IF;

  -- Notify every user who has the 'operator' role
  FOR v_op IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role = 'operator'
  LOOP
    -- Respect the operator's document_update notification preference (default: enabled)
    IF COALESCE(
      (SELECT in_app_enabled
       FROM public.notification_preferences
       WHERE user_id = v_op.user_id
         AND event_type = 'document_update'
       LIMIT 1),
      TRUE
    ) THEN
      INSERT INTO public.notifications (user_id, title, body, type, channel, link)
      VALUES (
        v_op.user_id,
        'New company document: ' || NEW.name,
        'A company document has been added to your Inspection Binder. Tap to review it.',
        'document_update',
        'in_app',
        '/operator?tab=inspection-binder'
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Trigger: fire after each row update on inspection_documents
CREATE TRIGGER notify_operators_on_fleet_share_trigger
AFTER UPDATE ON public.inspection_documents
FOR EACH ROW
EXECUTE FUNCTION public.notify_operators_on_fleet_share();
