
-- Group chats: allow null recipient for group messages; add is_system column;
-- open message SELECT/INSERT to group participants; enable message realtime by thread.

ALTER TABLE public.messages ALTER COLUMN recipient_id DROP NOT NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

-- Backfill: ensure existing 1:1 messages remain reachable (recipient_id already set).

-- SELECT: allow group thread participants to read any message in the thread
DROP POLICY IF EXISTS "Group participants can view messages" ON public.messages;
CREATE POLICY "Group participants can view messages" ON public.messages
FOR SELECT USING (
  thread_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.message_threads mt
    WHERE mt.id = messages.thread_id AND mt.is_group = true
  )
  AND public.is_thread_participant(thread_id, auth.uid())
);

-- INSERT: allow participant sender to insert into a group thread
DROP POLICY IF EXISTS "Group participants can send messages" ON public.messages;
CREATE POLICY "Group participants can send messages" ON public.messages
FOR INSERT WITH CHECK (
  auth.uid() = sender_id
  AND thread_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.message_threads mt
    WHERE mt.id = messages.thread_id AND mt.is_group = true
  )
  AND public.is_thread_participant(thread_id, auth.uid())
);

-- Enable realtime for the tables (idempotent)
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='message_threads';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.message_threads';
  END IF;
END $$;

DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='thread_participants';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.thread_participants';
  END IF;
END $$;

-- Helper: list group threads for current user with participant counts + last message preview
CREATE OR REPLACE FUNCTION public.list_my_group_threads()
RETURNS TABLE (
  thread_id uuid,
  title text,
  created_by uuid,
  created_at timestamptz,
  last_message_at timestamptz,
  last_message text,
  last_message_sender_id uuid,
  my_role_in_thread text,
  participant_count integer,
  unread_count integer
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH my_threads AS (
    SELECT tp.thread_id, tp.role_in_thread, tp.last_read_at
    FROM public.thread_participants tp
    WHERE tp.user_id = auth.uid()
  )
  SELECT
    mt.id AS thread_id,
    mt.title,
    mt.created_by,
    mt.created_at,
    mt.last_message_at,
    (
      SELECT COALESCE(NULLIF(m.body,''), m.attachment_name, '')
      FROM public.messages m
      WHERE m.thread_id = mt.id AND COALESCE(m.is_system,false) = false AND m.deleted_at IS NULL
      ORDER BY m.sent_at DESC LIMIT 1
    ) AS last_message,
    (
      SELECT m.sender_id FROM public.messages m
      WHERE m.thread_id = mt.id AND COALESCE(m.is_system,false) = false AND m.deleted_at IS NULL
      ORDER BY m.sent_at DESC LIMIT 1
    ) AS last_message_sender_id,
    (SELECT role_in_thread FROM my_threads WHERE thread_id = mt.id) AS my_role_in_thread,
    (SELECT count(*)::int FROM public.thread_participants tp2 WHERE tp2.thread_id = mt.id) AS participant_count,
    (
      SELECT count(*)::int FROM public.messages m
      WHERE m.thread_id = mt.id
        AND m.sender_id <> auth.uid()
        AND COALESCE(m.is_system,false) = false
        AND m.deleted_at IS NULL
        AND (
          (SELECT last_read_at FROM my_threads WHERE thread_id = mt.id) IS NULL
          OR m.sent_at > (SELECT last_read_at FROM my_threads WHERE thread_id = mt.id)
        )
    ) AS unread_count
  FROM public.message_threads mt
  WHERE mt.is_group = true
    AND mt.id IN (SELECT thread_id FROM my_threads)
  ORDER BY COALESCE(mt.last_message_at, mt.created_at) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_group_threads() TO authenticated;

-- Helper: participants of a thread (with role info) — respects thread membership via RLS on join
CREATE OR REPLACE FUNCTION public.get_thread_participants(_thread_id uuid)
RETURNS TABLE (
  user_id uuid,
  first_name text,
  last_name text,
  avatar_url text,
  primary_role text,
  role_in_thread text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    tp.user_id,
    p.first_name,
    p.last_name,
    p.avatar_url,
    (
      SELECT ur.role::text FROM public.user_roles ur WHERE ur.user_id = tp.user_id
      ORDER BY CASE ur.role
        WHEN 'owner' THEN 1 WHEN 'management' THEN 2 WHEN 'onboarding_staff' THEN 3
        WHEN 'dispatcher' THEN 4 WHEN 'truck_owner' THEN 5 WHEN 'operator' THEN 6 ELSE 9
      END LIMIT 1
    ) AS primary_role,
    tp.role_in_thread
  FROM public.thread_participants tp
  LEFT JOIN public.profiles p ON p.user_id = tp.user_id
  WHERE tp.thread_id = _thread_id
    AND public.is_thread_participant(_thread_id, auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.get_thread_participants(uuid) TO authenticated;

-- Mark a thread as read for current user
CREATE OR REPLACE FUNCTION public.mark_thread_read(_thread_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.thread_participants
  SET last_read_at = now()
  WHERE thread_id = _thread_id AND user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.mark_thread_read(uuid) TO authenticated;
