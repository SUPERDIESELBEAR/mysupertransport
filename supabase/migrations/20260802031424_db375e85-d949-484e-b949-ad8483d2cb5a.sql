CREATE OR REPLACE FUNCTION public.enforce_rods_correction_request_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_day public.rods_days;
BEGIN
  IF coalesce(btrim(NEW.issue),'') = '' THEN
    RAISE EXCEPTION 'A correction request must describe the issue.' USING ERRCODE = 'P0070';
  END IF;

  IF NEW.rods_day_id IS NULL THEN
    RAISE EXCEPTION 'A correction request must name the log it was raised against.' USING ERRCODE = 'P0070';
  END IF;

  SELECT * INTO v_day FROM public.rods_days WHERE id = NEW.rods_day_id;
  IF v_day.id IS NULL THEN
    RAISE EXCEPTION 'That log does not exist.' USING ERRCODE = 'P0070';
  END IF;
  IF v_day.status <> 'certified' THEN
    RAISE EXCEPTION 'A correction can only be requested against a certified log.' USING ERRCODE = 'P0071';
  END IF;

  NEW.operator_id := v_day.operator_id;
  NEW.log_date := v_day.log_date;

  NEW.status := 'open';
  NEW.driver_response := NULL;
  NEW.resolved_at := NULL;
  NEW.resolved_by_day_id := NULL;
  NEW.requested_at := now();

  SELECT coalesce(o.is_demo, false) INTO NEW.is_demo
    FROM public.operators o WHERE o.id = NEW.operator_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_rods_correction_request_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_privileged boolean := coalesce(current_setting('rods.privileged', true), 'off') = 'on';
BEGIN
  IF NEW.id <> OLD.id
     OR NEW.operator_id <> OLD.operator_id
     OR NEW.log_date <> OLD.log_date
     OR NEW.rods_day_id IS DISTINCT FROM OLD.rods_day_id
     OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
     OR NEW.requested_by_name IS DISTINCT FROM OLD.requested_by_name
     OR NEW.requested_at <> OLD.requested_at
     OR NEW.issue <> OLD.issue
     OR NEW.is_demo <> OLD.is_demo
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'A correction request is append-only; only the driver''s response may be recorded.'
      USING ERRCODE = 'P0072';
  END IF;

  IF NOT v_privileged THEN
    IF NEW.resolved_by_day_id IS DISTINCT FROM OLD.resolved_by_day_id THEN
      RAISE EXCEPTION 'A correction request is closed by the certified log, not by hand.'
        USING ERRCODE = 'P0072';
    END IF;
    IF NOT coalesce(public.is_own_rods_operator(OLD.operator_id), false) THEN
      RAISE EXCEPTION 'Only the driver may answer a correction request.' USING ERRCODE = 'P0073';
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status <> 'open' THEN
      RAISE EXCEPTION 'This correction request has already been resolved.' USING ERRCODE = 'P0074';
    END IF;
    IF NEW.status NOT IN ('actioned','declined') THEN
      RAISE EXCEPTION 'A correction request can only be actioned or declined.' USING ERRCODE = 'P0074';
    END IF;
    IF NEW.status = 'declined' AND coalesce(btrim(NEW.driver_response),'') = '' THEN
      RAISE EXCEPTION 'Declining a correction request requires a written response.' USING ERRCODE = 'P0075';
    END IF;
    NEW.resolved_at := coalesce(NEW.resolved_at, now());
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_eld_escalation_ledger(p_event_id uuid)
RETURNS TABLE (
  id uuid,
  event_id uuid,
  notification_type text,
  day_number integer,
  channel text,
  sent_on date,
  is_override boolean,
  created_at timestamptz,
  recipient_user_id uuid,
  recipient_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  SELECT n.id, n.event_id, n.notification_type, n.day_number, n.channel, n.sent_on,
         n.is_override, n.created_at, n.recipient_user_id,
         NULLIF(btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), '')
  FROM public.eld_malfunction_notifications n
  LEFT JOIN public.profiles p ON p.user_id = n.recipient_user_id
  WHERE n.event_id = p_event_id
    AND public.is_staff(auth.uid())
  ORDER BY n.created_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.notify_rods_correction_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_user_id uuid;
  v_driver_name text;
BEGIN
  SELECT o.user_id INTO v_user_id FROM public.operators o WHERE o.id = NEW.operator_id;

  IF TG_OP = 'INSERT' THEN
    IF v_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id, priority)
      VALUES (
        v_user_id,
        'rods_correction_requested',
        'Log correction requested',
        'The office asked you to look at your log for ' || to_char(NEW.log_date, 'Mon FMDD, YYYY') || '.',
        '/operator?view=paper-logs&date=' || NEW.log_date::text,
        'rods_correction_request', NEW.id, 'high'
      );
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('actioned','declined')
     AND NEW.requested_by IS NOT NULL THEN
    SELECT nullif(btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), '')
      INTO v_driver_name
      FROM public.profiles p WHERE p.user_id = v_user_id;

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
      'rods_correction_request', NEW.id, 'normal'
    );
  END IF;
  RETURN NEW;
END;
$$;
