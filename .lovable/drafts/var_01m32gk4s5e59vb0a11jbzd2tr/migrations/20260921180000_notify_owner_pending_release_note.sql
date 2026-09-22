-- Tell the owner when an announcement is waiting for his approval.
--
-- Additive only. A pending announcement currently notifies nobody, so the owner
-- only finds an auto-drafted update by opening Settings -> What's New. This adds
-- one in-app notification, to the owner role only, when a release note lands in
-- (or returns to) 'pending'. Nothing is emailed here and no staff member is told
-- anything about a pending draft: staff delivery still happens only on approval,
-- through notify_staff_on_release_note, which this migration does not touch.
--
-- UNDO:
--   DROP TRIGGER IF EXISTS trg_notify_owner_pending_release_note_ins ON public.release_notes;
--   DROP TRIGGER IF EXISTS trg_notify_owner_pending_release_note_upd ON public.release_notes;
--   DROP FUNCTION IF EXISTS public.notify_owner_on_pending_release_note();

CREATE OR REPLACE FUNCTION public.notify_owner_on_pending_release_note()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_owner RECORD;
  v_body  text := left(COALESCE(NEW.body, ''), 300);
BEGIN
  FOR v_owner IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role = 'owner'
  LOOP
    -- Same courtesy as the published path: an explicit opt-out is honoured.
    IF COALESCE(
      (SELECT in_app_enabled FROM public.notification_preferences
       WHERE user_id = v_owner.user_id AND event_type = 'release_note_pending' LIMIT 1),
      TRUE
    ) THEN
      INSERT INTO public.notifications (user_id, title, body, type, channel, link)
      VALUES (
        v_owner.user_id,
        'New update ready to review — ' || NEW.title,
        v_body,
        'release_note_pending',
        'in_app',
        '/dashboard?view=whats-new'
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_owner_on_pending_release_note() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_owner_on_pending_release_note() FROM anon;
REVOKE ALL ON FUNCTION public.notify_owner_on_pending_release_note() FROM authenticated;

DROP TRIGGER IF EXISTS trg_notify_owner_pending_release_note_ins ON public.release_notes;
CREATE TRIGGER trg_notify_owner_pending_release_note_ins
AFTER INSERT ON public.release_notes
FOR EACH ROW WHEN (NEW.status = 'pending')
EXECUTE FUNCTION public.notify_owner_on_pending_release_note();

DROP TRIGGER IF EXISTS trg_notify_owner_pending_release_note_upd ON public.release_notes;
CREATE TRIGGER trg_notify_owner_pending_release_note_upd
AFTER UPDATE OF status ON public.release_notes
FOR EACH ROW WHEN (NEW.status = 'pending' AND OLD.status <> 'pending')
EXECUTE FUNCTION public.notify_owner_on_pending_release_note();
