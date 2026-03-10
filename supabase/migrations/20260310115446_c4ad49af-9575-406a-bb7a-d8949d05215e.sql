
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

  -- Notify dispatchers and management (existing behaviour)
  FOR v_recipient IN
    SELECT DISTINCT
      ur.user_id,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = ur.user_id AND role = 'management'
        ) THEN '/management?view=dispatch'
        ELSE '/dispatch'
      END AS nav_link
    FROM public.user_roles ur
    WHERE ur.role IN ('dispatcher', 'management')
      AND ur.user_id <> v_op.user_id
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.notifications
      WHERE user_id = v_recipient.user_id
        AND type     = 'truck_down'
        AND read_at  IS NULL
        AND sent_at  > now() - interval '30 minutes'
        AND title    = 'Truck Down — ' || v_operator_name
    ) THEN CONTINUE; END IF;

    INSERT INTO public.notifications (user_id, title, body, type, channel, link)
    VALUES (
      v_recipient.user_id,
      'Truck Down — ' || v_operator_name,
      v_operator_name || ' (Unit ' || v_unit || ') has reported a truck down.',
      'truck_down',
      'in_app',
      v_recipient.nav_link
    );
  END LOOP;

  -- Notify assigned onboarding staff (new)
  IF v_op.assigned_onboarding_staff IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE user_id = v_op.assigned_onboarding_staff
        AND type     = 'truck_down'
        AND read_at  IS NULL
        AND sent_at  > now() - interval '30 minutes'
        AND title    = 'Truck Down — ' || v_operator_name
    ) THEN
      INSERT INTO public.notifications (user_id, title, body, type, channel, link)
      VALUES (
        v_op.assigned_onboarding_staff,
        'Truck Down — ' || v_operator_name,
        v_operator_name || ' (Unit ' || v_unit || ') has reported a truck down.',
        'truck_down',
        'in_app',
        '/staff?operator=' || NEW.operator_id::text
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
