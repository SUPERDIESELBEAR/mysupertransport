-- The driver bell item linked to '/operator?view=paper-logs&date=…'. The driver
-- portal resolved only '?tab=', so the link silently fell back to the progress
-- screen: the notification rendered correctly and went nowhere. The portal now
-- also accepts '?view=' (src/lib/operatorRoutes.ts), and the link below uses
-- the canonical path form so it does not depend on that fallback at all.
CREATE OR REPLACE FUNCTION public.notify_rods_correction_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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
        '/operator/paper-logs?date=' || NEW.log_date::text,
        'rods_correction_request', NEW.id, 'action'
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
      'rods_correction_request', NEW.id, 'watch'
    );
  END IF;
  RETURN NEW;
END;
$$;

UPDATE public.notifications
   SET link = '/operator/paper-logs?date=' || split_part(link, 'date=', 2)
 WHERE type = 'rods_correction_requested'
   AND link LIKE '/operator?view=paper-logs%';