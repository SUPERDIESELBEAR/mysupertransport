
DROP POLICY IF EXISTS "Recipient can mark as read" ON public.messages;

CREATE POLICY "Recipient can mark as read"
ON public.messages
FOR UPDATE
USING (auth.uid() = recipient_id)
WITH CHECK (auth.uid() = recipient_id);

CREATE OR REPLACE FUNCTION public.enforce_message_recipient_update_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sender is allowed to edit body/attachments (own edit policy).
  -- Staff can pin messages.
  -- If the updater is the recipient (and not sender and not staff),
  -- restrict changes to non-content fields (read_at and reactions-adjacent metadata).
  IF auth.uid() = NEW.recipient_id
     AND auth.uid() <> COALESCE(NEW.sender_id, '00000000-0000-0000-0000-000000000000'::uuid)
     AND NOT public.is_staff(auth.uid())
  THEN
    IF NEW.sender_id IS DISTINCT FROM OLD.sender_id
       OR NEW.recipient_id IS DISTINCT FROM OLD.recipient_id
       OR NEW.body IS DISTINCT FROM OLD.body
       OR NEW.attachment_url IS DISTINCT FROM OLD.attachment_url
       OR NEW.attachment_name IS DISTINCT FROM OLD.attachment_name
       OR NEW.attachment_mime IS DISTINCT FROM OLD.attachment_mime
       OR NEW.attachment_size_bytes IS DISTINCT FROM OLD.attachment_size_bytes
       OR NEW.reply_to_id IS DISTINCT FROM OLD.reply_to_id
       OR NEW.sent_at IS DISTINCT FROM OLD.sent_at
       OR NEW.edited_at IS DISTINCT FROM OLD.edited_at
       OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
       OR NEW.pinned_at IS DISTINCT FROM OLD.pinned_at
    THEN
      RAISE EXCEPTION 'Recipients may only mark messages as read'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_message_recipient_update_immutability ON public.messages;
CREATE TRIGGER enforce_message_recipient_update_immutability
BEFORE UPDATE ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.enforce_message_recipient_update_immutability();
