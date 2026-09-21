-- Defects 1 and 2 of docs/passes/2026-09-21-1930-suite-reconciliation.md.
--
-- public.notify_staff_on_release_note() was pinned to 'public' alone, and held a
-- bare INSERT INTO public.notifications: if that insert raised (a notifications
-- check constraint, a bad channel/priority), it aborted the owner's approval of
-- the announcement itself. Every other notification writer routes through
-- public.try_notify(...) — copied here from public.notify_operator_on_status_change
-- style call sites — which owns the insert inside its own EXCEPTION handler and
-- records an undelivered notice instead of failing the caller.
--
-- Additive: function body only. Triggers, policies and grants are unchanged and
-- client EXECUTE stays revoked.
--
-- UNDO: restore the body from drizzle/migrations/0021_release_note_approval.sql
-- (SET search_path TO 'public', raw INSERT INTO public.notifications in the loop).

CREATE OR REPLACE FUNCTION public.notify_staff_on_release_note()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_staff RECORD;
  v_roles text[] := COALESCE(NULLIF(NEW.target_roles, '{}'::text[]),
                             ARRAY['onboarding_staff','dispatcher','management','owner']::text[]);
  v_fn_url CONSTANT TEXT := 'https://qgxpkcudwjmacrdcyvhj.supabase.co/functions/v1/send-release-note';
  v_anon   CONSTANT TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFneHBrY3Vkd2ptYWNyZGN5dmhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NDg3NDgsImV4cCI6MjA4ODQyNDc0OH0.LoP0_X7zPsOL4-GHQim1orOhlqk6znV6i-tGB7__66o';
BEGIN
  FOR v_staff IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role::text = ANY(v_roles)
      AND ur.role IN ('onboarding_staff', 'dispatcher', 'management', 'owner')
  LOOP
    IF COALESCE(
      (SELECT in_app_enabled FROM public.notification_preferences
       WHERE user_id = v_staff.user_id AND event_type = 'release_note' LIMIT 1),
      TRUE
    ) THEN
      PERFORM public.try_notify(
        p_user_id      => v_staff.user_id,
        p_type         => 'release_note',
        p_title        => '🆕 ' || NEW.title,
        p_body         => NEW.body,
        p_link         => '/management?view=whats-new',
        p_entity_type  => 'release_note',
        p_entity_id    => NEW.id,
        p_entity_label => NEW.title
      );
    END IF;
  END LOOP;

  PERFORM net.http_post(
    url     := v_fn_url,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_anon),
    body    := jsonb_build_object('release_note_id', NEW.id::text, 'title', NEW.title, 'body', NEW.body)
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_staff_on_release_note() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_staff_on_release_note() FROM anon;
REVOKE ALL ON FUNCTION public.notify_staff_on_release_note() FROM authenticated;
