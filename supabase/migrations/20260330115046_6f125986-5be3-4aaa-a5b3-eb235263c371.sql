
-- Create release_notes table
CREATE TABLE public.release_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.release_notes ENABLE ROW LEVEL SECURITY;

-- Management/owner can insert
CREATE POLICY "Management can insert release notes"
  ON public.release_notes FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)
  );

-- Management/owner can update
CREATE POLICY "Management can update release notes"
  ON public.release_notes FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)
  );

-- Management/owner can delete
CREATE POLICY "Management can delete release notes"
  ON public.release_notes FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)
  );

-- All staff can read
CREATE POLICY "Staff can read release notes"
  ON public.release_notes FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

-- Trigger function to notify all staff + fire email edge function
CREATE OR REPLACE FUNCTION public.notify_staff_on_release_note()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_staff RECORD;
  v_fn_url CONSTANT TEXT := 'https://qgxpkcudwjmacrdcyvhj.supabase.co/functions/v1/send-release-note';
  v_anon   CONSTANT TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFneHBrY3Vkd2ptYWNyZGN5dmhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NDg3NDgsImV4cCI6MjA4ODQyNDc0OH0.LoP0_X7zPsOL4-GHQim1orOhlqk6znV6i-tGB7__66o';
BEGIN
  -- Insert in-app notification for every staff member
  FOR v_staff IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role IN ('onboarding_staff', 'dispatcher', 'management', 'owner')
  LOOP
    -- Respect notification preferences (default: enabled)
    IF COALESCE(
      (SELECT in_app_enabled FROM public.notification_preferences
       WHERE user_id = v_staff.user_id AND event_type = 'release_note' LIMIT 1),
      TRUE
    ) THEN
      INSERT INTO public.notifications (user_id, title, body, type, channel, link)
      VALUES (
        v_staff.user_id,
        '🆕 ' || NEW.title,
        NEW.body,
        'release_note',
        'in_app',
        '/management?view=whats-new'
      );
    END IF;
  END LOOP;

  -- Fire edge function for email delivery
  PERFORM net.http_post(
    url     := v_fn_url,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_anon),
    body    := jsonb_build_object('release_note_id', NEW.id::text, 'title', NEW.title, 'body', NEW.body)
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_staff_on_release_note
  AFTER INSERT ON public.release_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_staff_on_release_note();
