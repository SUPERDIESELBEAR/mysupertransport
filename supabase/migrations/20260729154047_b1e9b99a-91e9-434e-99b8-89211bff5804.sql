
CREATE TYPE public.staff_availability_mode AS ENUM ('all_drivers','specific_drivers','none');

CREATE TABLE public.staff_messaging_settings (
  staff_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  availability_mode public.staff_availability_mode NOT NULL DEFAULT 'none',
  availability_note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_messaging_settings TO authenticated;
GRANT ALL ON public.staff_messaging_settings TO service_role;
ALTER TABLE public.staff_messaging_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_read_all_auth" ON public.staff_messaging_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "sms_self_insert" ON public.staff_messaging_settings
  FOR INSERT TO authenticated WITH CHECK (staff_id = auth.uid());
CREATE POLICY "sms_self_update" ON public.staff_messaging_settings
  FOR UPDATE TO authenticated USING (staff_id = auth.uid()) WITH CHECK (staff_id = auth.uid());
CREATE POLICY "sms_admin_update" ON public.staff_messaging_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'management'))
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'management'));
CREATE POLICY "sms_admin_insert" ON public.staff_messaging_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'management'));

CREATE TABLE public.driver_staff_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (driver_id, staff_id)
);
CREATE INDEX idx_dsc_driver ON public.driver_staff_contacts(driver_id);
CREATE INDEX idx_dsc_staff ON public.driver_staff_contacts(staff_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_staff_contacts TO authenticated;
GRANT ALL ON public.driver_staff_contacts TO service_role;
ALTER TABLE public.driver_staff_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dsc_driver_select_own" ON public.driver_staff_contacts
  FOR SELECT TO authenticated USING (driver_id = auth.uid());
CREATE POLICY "dsc_staff_select_own" ON public.driver_staff_contacts
  FOR SELECT TO authenticated USING (staff_id = auth.uid());
CREATE POLICY "dsc_admin_select" ON public.driver_staff_contacts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'management'));
CREATE POLICY "dsc_admin_insert" ON public.driver_staff_contacts
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'management'));
CREATE POLICY "dsc_admin_delete" ON public.driver_staff_contacts
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'management'));
CREATE POLICY "dsc_staff_insert_self" ON public.driver_staff_contacts
  FOR INSERT TO authenticated WITH CHECK (staff_id = auth.uid());
CREATE POLICY "dsc_staff_delete_self" ON public.driver_staff_contacts
  FOR DELETE TO authenticated USING (staff_id = auth.uid());

CREATE TABLE public.message_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_group BOOLEAN NOT NULL DEFAULT false,
  title TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_threads TO authenticated;
GRANT ALL ON public.message_threads TO service_role;
ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.thread_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.message_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_in_thread TEXT NOT NULL DEFAULT 'member' CHECK (role_in_thread IN ('owner','member')),
  last_read_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (thread_id, user_id)
);
CREATE INDEX idx_tp_thread ON public.thread_participants(thread_id);
CREATE INDEX idx_tp_user ON public.thread_participants(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.thread_participants TO authenticated;
GRANT ALL ON public.thread_participants TO service_role;
ALTER TABLE public.thread_participants ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_thread_participant(_thread UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.thread_participants WHERE thread_id = _thread AND user_id = _user);
$$;

CREATE POLICY "mt_participant_select" ON public.message_threads
  FOR SELECT TO authenticated USING (public.is_thread_participant(id, auth.uid()));
CREATE POLICY "mt_admin_select" ON public.message_threads
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'management'));
CREATE POLICY "mt_authenticated_insert" ON public.message_threads
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "mt_participant_update" ON public.message_threads
  FOR UPDATE TO authenticated USING (public.is_thread_participant(id, auth.uid()));

CREATE POLICY "tp_self_select" ON public.thread_participants
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "tp_participant_select" ON public.thread_participants
  FOR SELECT TO authenticated USING (public.is_thread_participant(thread_id, auth.uid()));
CREATE POLICY "tp_admin_select" ON public.thread_participants
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'management'));
CREATE POLICY "tp_participant_insert" ON public.thread_participants
  FOR INSERT TO authenticated
  WITH CHECK (public.is_thread_participant(thread_id, auth.uid()) OR user_id = auth.uid());
CREATE POLICY "tp_self_update" ON public.thread_participants
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.can_driver_message_staff(_driver UUID, _staff UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _mode public.staff_availability_mode;
BEGIN
  SELECT availability_mode INTO _mode FROM public.staff_messaging_settings WHERE staff_id = _staff;
  IF _mode IS NULL OR _mode = 'none' THEN RETURN FALSE; END IF;
  IF _mode = 'all_drivers' THEN RETURN TRUE; END IF;
  RETURN EXISTS (SELECT 1 FROM public.driver_staff_contacts WHERE driver_id = _driver AND staff_id = _staff);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_driver_contacts(_driver UUID)
RETURNS TABLE (
  staff_id UUID, full_name TEXT, first_name TEXT, last_name TEXT,
  avatar_url TEXT, role TEXT,
  availability_mode public.staff_availability_mode, availability_note TEXT, source TEXT
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH staff_pool AS (
    SELECT s.staff_id, s.availability_mode, s.availability_note, 'all_drivers'::TEXT AS source
    FROM public.staff_messaging_settings s
    WHERE s.availability_mode = 'all_drivers'
    UNION
    SELECT s.staff_id, s.availability_mode, s.availability_note, 'specific'::TEXT AS source
    FROM public.staff_messaging_settings s
    JOIN public.driver_staff_contacts dsc ON dsc.staff_id = s.staff_id
    WHERE s.availability_mode = 'specific_drivers' AND dsc.driver_id = _driver
  )
  SELECT sp.staff_id,
    TRIM(CONCAT(COALESCE(p.first_name,''), ' ', COALESCE(p.last_name,''))) AS full_name,
    p.first_name, p.last_name, p.avatar_url,
    (SELECT ur.role::TEXT FROM public.user_roles ur
      WHERE ur.user_id = sp.staff_id
        AND ur.role IN ('owner','management','dispatcher','onboarding_staff')
      ORDER BY CASE ur.role WHEN 'owner' THEN 1 WHEN 'management' THEN 2 WHEN 'dispatcher' THEN 3 WHEN 'onboarding_staff' THEN 4 ELSE 5 END
      LIMIT 1) AS role,
    sp.availability_mode, sp.availability_note, sp.source
  FROM staff_pool sp
  LEFT JOIN public.profiles p ON p.user_id = sp.staff_id
  ORDER BY full_name NULLS LAST;
$$;

-- Backfill 1:1 threads for existing messages
DO $$
DECLARE r RECORD; new_thread_id UUID;
BEGIN
  FOR r IN
    SELECT DISTINCT LEAST(sender_id, recipient_id) AS a, GREATEST(sender_id, recipient_id) AS b
    FROM public.messages
    WHERE thread_id IS NULL AND sender_id IS NOT NULL AND recipient_id IS NOT NULL
  LOOP
    INSERT INTO public.message_threads (is_group, created_by) VALUES (false, r.a) RETURNING id INTO new_thread_id;
    INSERT INTO public.thread_participants (thread_id, user_id) VALUES (new_thread_id, r.a), (new_thread_id, r.b);
    UPDATE public.messages SET thread_id = new_thread_id
     WHERE thread_id IS NULL
       AND ((sender_id = r.a AND recipient_id = r.b) OR (sender_id = r.b AND recipient_id = r.a));
    UPDATE public.message_threads
       SET last_message_at = (SELECT MAX(sent_at) FROM public.messages WHERE thread_id = new_thread_id)
     WHERE id = new_thread_id;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.bump_thread_last_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.thread_id IS NOT NULL THEN
    UPDATE public.message_threads SET last_message_at = NEW.sent_at WHERE id = NEW.thread_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_bump_thread_last_message ON public.messages;
CREATE TRIGGER trg_bump_thread_last_message
AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.bump_thread_last_message();

ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_messaging_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_staff_contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.thread_participants;
