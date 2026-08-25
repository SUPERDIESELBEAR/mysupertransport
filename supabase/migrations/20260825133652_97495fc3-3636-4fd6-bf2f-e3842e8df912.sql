CREATE OR REPLACE FUNCTION public.get_load_linked_messages(p_load_id uuid)
RETURNS TABLE (
  id uuid,
  thread_id uuid,
  sender_id uuid,
  recipient_id uuid,
  body text,
  sent_at timestamp with time zone,
  read_at timestamp with time zone,
  reply_to_id uuid,
  edited_at timestamp with time zone,
  deleted_at timestamp with time zone,
  pinned_at timestamp with time zone,
  pinned_by uuid,
  attachment_url text,
  attachment_name text,
  attachment_mime text,
  attachment_size_bytes integer,
  is_system boolean,
  load_id uuid,
  sender_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    m.id,
    m.thread_id,
    m.sender_id,
    m.recipient_id,
    m.body,
    m.sent_at,
    m.read_at,
    m.reply_to_id,
    m.edited_at,
    m.deleted_at,
    m.pinned_at,
    m.pinned_by,
    m.attachment_url,
    m.attachment_name,
    m.attachment_mime,
    m.attachment_size_bytes,
    m.is_system,
    m.load_id,
    COALESCE(NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Unknown') AS sender_name
  FROM public.messages m
  LEFT JOIN public.profiles p ON p.user_id = m.sender_id
  WHERE m.load_id = p_load_id
    AND p_load_id IS NOT NULL
    AND public.is_staff(auth.uid())
  ORDER BY m.sent_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_load_linked_messages(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_load_linked_messages(uuid) TO authenticated;