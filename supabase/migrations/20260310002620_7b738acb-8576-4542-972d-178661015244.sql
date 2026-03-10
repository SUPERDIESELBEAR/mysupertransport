
-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger function: notify all dispatchers + management when any operator goes
-- Truck Down.  Fires on INSERT (new record at truck_down) and UPDATE (status
-- changes TO truck_down from something else).
-- ─────────────────────────────────────────────────────────────────────────────
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
  -- Only act when the new status IS truck_down
  IF NEW.dispatch_status <> 'truck_down' THEN RETURN NEW; END IF;

  -- For updates: only fire when transitioning INTO truck_down (not staying there)
  IF TG_OP = 'UPDATE' AND OLD.dispatch_status = 'truck_down' THEN RETURN NEW; END IF;

  -- ── Resolve operator info ──────────────────────────────────────────────────
  SELECT o.id, o.user_id, o.application_id, o.unit_number,
         os.unit_number AS os_unit_number
  INTO v_op
  FROM public.operators o
  LEFT JOIN public.onboarding_status os ON os.operator_id = o.id
  WHERE o.id = NEW.operator_id;

  IF NOT FOUND THEN RETURN NEW; END IF;

  v_unit := COALESCE(v_op.os_unit_number, v_op.unit_number, 'Unknown Unit');

  -- ── Build operator name from linked application ───────────────────────────
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

  -- ── Notify each unique dispatcher / management user ───────────────────────
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
    -- Deduplicate: skip if an unread truck_down alert for this operator
    -- was already sent to this user in the last 30 minutes
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

  RETURN NEW;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Attach the trigger to active_dispatch
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS on_truck_down_status ON public.active_dispatch;

CREATE TRIGGER on_truck_down_status
  AFTER INSERT OR UPDATE OF dispatch_status
  ON public.active_dispatch
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_truck_down();
