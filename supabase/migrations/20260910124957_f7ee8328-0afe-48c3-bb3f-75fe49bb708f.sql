
-- profiles: self-updates limited to personal fields
CREATE OR REPLACE FUNCTION public.enforce_profiles_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  allowed text[] := ARRAY['first_name','last_name','phone','home_state','home_country','avatar_url','birth_month','birth_day','updated_at'];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF auth.uid() = OLD.user_id THEN
    IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
      RAISE EXCEPTION 'You may only update your own personal profile details';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_profiles_self_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_profiles_self_update ON public.profiles;
CREATE TRIGGER trg_profiles_self_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_profiles_self_update();

-- notifications: recipients limited to triage fields
CREATE OR REPLACE FUNCTION public.enforce_notifications_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  allowed text[] := ARRAY['read_at','snoozed_until','archived_at'];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF auth.uid() = OLD.assigned_to THEN
    allowed := allowed || ARRAY['assigned_to'];
  END IF;
  IF auth.uid() = OLD.user_id OR auth.uid() = OLD.assigned_to THEN
    IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
      RAISE EXCEPTION 'You may only mark your notifications read, snoozed, or archived';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_notifications_self_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notifications_self_update ON public.notifications;
CREATE TRIGGER trg_notifications_self_update
BEFORE UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.enforce_notifications_self_update();

-- thread_participants: self-updates limited to last_read_at
CREATE OR REPLACE FUNCTION public.enforce_thread_participants_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  allowed text[] := ARRAY['last_read_at'];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'management') THEN
    RETURN NEW;
  END IF;
  IF auth.uid() = OLD.user_id THEN
    IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
      RAISE EXCEPTION 'You may only update your own last-read time on a thread';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_thread_participants_self_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_thread_participants_self_update ON public.thread_participants;
CREATE TRIGGER trg_thread_participants_self_update
BEFORE UPDATE ON public.thread_participants
FOR EACH ROW EXECUTE FUNCTION public.enforce_thread_participants_self_update();
