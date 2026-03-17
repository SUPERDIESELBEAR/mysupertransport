
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

  -- Insert in-app notification
  INSERT INTO public.notifications (user_id, title, body, type, channel, link)
  VALUES (NEW.driver_id, v_title, v_body, 'document_update', 'in_app', '/operator?tab=inspection-binder');

  -- When flagged as needs_attention, also fire email via edge function
  IF NEW.status = 'needs_attention' THEN
    PERFORM net.http_post(
      url     := v_fn_url,
      headers := jsonb_build_object(
        'Content-Type',   'application/json',
        'Authorization',  'Bearer ' || v_anon
      ),
      body    := jsonb_build_object(
        'driver_user_id', NEW.driver_id::text,
        'file_name',      NEW.file_name,
        'category',       NEW.category::text
      )
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- Re-attach the trigger (drop first to ensure clean state)
DROP TRIGGER IF EXISTS notify_on_upload_status_change ON public.driver_uploads;

CREATE TRIGGER notify_on_upload_status_change
  AFTER UPDATE OF status ON public.driver_uploads
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_driver_on_upload_status_change();
