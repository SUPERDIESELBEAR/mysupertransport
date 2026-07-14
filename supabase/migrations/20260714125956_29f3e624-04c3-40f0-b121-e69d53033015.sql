
-- Restrict recipient UPDATEs on messages to only the read_at column.
-- Replaces the previous permissive USING-only policy.

DROP POLICY IF EXISTS "Recipient can mark as read" ON public.messages;

CREATE OR REPLACE FUNCTION public.prevent_recipient_message_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only enforce when the updater is the recipient (not the sender).
  IF auth.uid() = OLD.recipient_id AND auth.uid() IS DISTINCT FROM OLD.sender_id THEN
    IF NEW.id                IS DISTINCT FROM OLD.id
       OR NEW.sender_id      IS DISTINCT FROM OLD.sender_id
       OR NEW.recipient_id   IS DISTINCT FROM OLD.recipient_id
       OR NEW.body           IS DISTINCT FROM OLD.body
       OR NEW.attachment_url IS DISTINCT FROM OLD.attachment_url
       OR NEW.attachment_name IS DISTINCT FROM OLD.attachment_name
       OR NEW.attachment_mime IS DISTINCT FROM OLD.attachment_mime
       OR NEW.sent_at        IS DISTINCT FROM OLD.sent_at
       OR NEW.deleted_at     IS DISTINCT FROM OLD.deleted_at
    THEN
      RAISE EXCEPTION 'Recipients may only update read_at on messages';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_recipient_message_tampering ON public.messages;
CREATE TRIGGER trg_prevent_recipient_message_tampering
BEFORE UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.prevent_recipient_message_tampering();

CREATE POLICY "Recipient can mark as read"
ON public.messages
FOR UPDATE
TO authenticated
USING (auth.uid() = recipient_id)
WITH CHECK (
  auth.uid() = recipient_id
  AND sender_id       = (SELECT sender_id       FROM public.messages WHERE id = messages.id)
  AND recipient_id    = (SELECT recipient_id    FROM public.messages WHERE id = messages.id)
  AND body            IS NOT DISTINCT FROM (SELECT body            FROM public.messages WHERE id = messages.id)
  AND attachment_url  IS NOT DISTINCT FROM (SELECT attachment_url  FROM public.messages WHERE id = messages.id)
  AND attachment_name IS NOT DISTINCT FROM (SELECT attachment_name FROM public.messages WHERE id = messages.id)
  AND attachment_mime IS NOT DISTINCT FROM (SELECT attachment_mime FROM public.messages WHERE id = messages.id)
);
