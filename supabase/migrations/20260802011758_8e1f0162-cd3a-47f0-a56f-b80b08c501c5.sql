CREATE OR REPLACE FUNCTION public.notify_rods_correction_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_driver_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT o.user_id INTO v_user_id FROM public.operators o WHERE o.id = NEW.operator_id;
    IF v_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id, priority)
      VALUES (
        v_user_id,
        'rods_correction_requested',
        'Log correction requested',
        'The office asked you to look at your log for ' || to_char(NEW.log_date, 'Mon FMDD, YYYY') || '.',
        '/operator?view=logs&date=' || NEW.log_date::text,
        'rods_correction_request', NEW.id, 'high'
      );
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('actioned','declined')
     AND NEW.requested_by IS NOT NULL THEN
    SELECT o.driver_name INTO v_driver_name FROM public.operators o WHERE o.id = NEW.operator_id;
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

CREATE TRIGGER trg_notify_rods_correction_request_insert
  AFTER INSERT ON public.rods_correction_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_rods_correction_request();

CREATE TRIGGER trg_notify_rods_correction_request_update
  AFTER UPDATE ON public.rods_correction_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_rods_correction_request();