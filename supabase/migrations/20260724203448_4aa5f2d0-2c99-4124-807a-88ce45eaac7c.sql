
-- Notify staff when the driver signs an OSAS
CREATE OR REPLACE FUNCTION public.notify_staff_on_osas_signed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    -- Fallback: notify all onboarding staff
    SELECT COALESCE(array_agg(DISTINCT user_id), '{}')
    INTO v_recipients
    FROM public.user_roles
    WHERE role IN ('onboarding_staff','management','owner');
  END IF;

  FOREACH v_recipient IN ARRAY v_recipients LOOP
    INSERT INTO public.notifications (user_id, title, body, type, channel, link)
    VALUES (
      v_recipient,
      'OSAS signed by ' || v_operator_name,
      v_operator_name || ' signed the Onboard Systems Assignment Sheet' ||
        COALESCE(' (Unit ' || NEW.unit_number || ')', '') || '.',
      'osas_signed',
      'in_app',
      '/dashboard?view=drivers&operator=' || NEW.operator_id::text
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_staff_on_osas_signed ON public.onboard_assignment_sheets;
CREATE TRIGGER trg_notify_staff_on_osas_signed
AFTER UPDATE ON public.onboard_assignment_sheets
FOR EACH ROW EXECUTE FUNCTION public.notify_staff_on_osas_signed();

-- Legacy cleanup (idempotent)
DROP FUNCTION IF EXISTS public.execute_equipment_asset_signature(uuid, text, text);
