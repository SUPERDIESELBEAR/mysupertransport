
-- ============================================================
-- Phase 2a: Messaging upgrades schema
-- ============================================================

-- 1. Extend messages table -----------------------------------
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS attachment_mime text,
  ADD COLUMN IF NOT EXISTS attachment_size_bytes integer;

CREATE INDEX IF NOT EXISTS idx_messages_thread_pinned
  ON public.messages (thread_id, pinned_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_messages_reply_to
  ON public.messages (reply_to_id);

-- Allow sender to UPDATE own messages (edit body within 5 min OR soft-delete OR clear attachment).
-- Existing "Recipient can mark as read" policy stays for read_at toggling.
DROP POLICY IF EXISTS "Sender can edit or delete own messages" ON public.messages;
CREATE POLICY "Sender can edit or delete own messages"
  ON public.messages
  FOR UPDATE
  USING (auth.uid() = sender_id)
  WITH CHECK (auth.uid() = sender_id);

-- Allow staff to pin/unpin any message they can see
DROP POLICY IF EXISTS "Staff can pin messages" ON public.messages;
CREATE POLICY "Staff can pin messages"
  ON public.messages
  FOR UPDATE
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- 2. Validation trigger: enforce 5-minute edit window for body changes -----
CREATE OR REPLACE FUNCTION public.enforce_message_edit_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If sender is editing their own message body, enforce 5-min window
  IF NEW.sender_id = OLD.sender_id
     AND auth.uid() = OLD.sender_id
     AND NEW.body IS DISTINCT FROM OLD.body
     AND OLD.deleted_at IS NULL
  THEN
    IF OLD.sent_at < (now() - interval '5 minutes') THEN
      RAISE EXCEPTION 'Edit window has expired (5 minutes)';
    END IF;
    NEW.edited_at := now();
  END IF;

  -- Soft-delete: blank out body & attachment for safety
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    NEW.body := '';
    NEW.attachment_url := NULL;
    NEW.attachment_name := NULL;
    NEW.attachment_mime := NULL;
    NEW.attachment_size_bytes := NULL;
  END IF;

  -- Track who pinned
  IF NEW.pinned_at IS DISTINCT FROM OLD.pinned_at THEN
    IF NEW.pinned_at IS NOT NULL THEN
      NEW.pinned_by := auth.uid();
    ELSE
      NEW.pinned_by := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_message_edit_rules ON public.messages;
CREATE TRIGGER trg_enforce_message_edit_rules
BEFORE UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.enforce_message_edit_rules();

-- 3. Reactions table -----------------------------------------
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_message_reactions_message
  ON public.message_reactions (message_id);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- Users can see reactions on messages they can see (sender or recipient)
DROP POLICY IF EXISTS "View reactions on visible messages" ON public.message_reactions;
CREATE POLICY "View reactions on visible messages"
  ON public.message_reactions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_reactions.message_id
        AND (auth.uid() = m.sender_id OR auth.uid() = m.recipient_id)
    )
  );

-- Users can add their own reactions on messages they can see
DROP POLICY IF EXISTS "Add own reactions" ON public.message_reactions;
CREATE POLICY "Add own reactions"
  ON public.message_reactions
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_reactions.message_id
        AND (auth.uid() = m.sender_id OR auth.uid() = m.recipient_id)
    )
  );

-- Users can remove only their own reactions
DROP POLICY IF EXISTS "Remove own reactions" ON public.message_reactions;
CREATE POLICY "Remove own reactions"
  ON public.message_reactions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add reactions table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;

-- 4. Storage bucket for attachments --------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'message-attachments',
  'message-attachments',
  false,
  10485760,  -- 10 MB
  ARRAY['image/png','image/jpeg','image/jpg','image/webp','image/gif','application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Bucket policies: file path is `{auth.uid()}/{message_id_or_uuid}/{filename}`
DROP POLICY IF EXISTS "Users can upload own message attachments" ON storage.objects;
CREATE POLICY "Users can upload own message attachments"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'message-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can view own message attachments" ON storage.objects;
CREATE POLICY "Users can view own message attachments"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'message-attachments'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.is_staff(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.messages m
        WHERE m.attachment_url LIKE '%' || storage.objects.name || '%'
          AND (auth.uid() = m.sender_id OR auth.uid() = m.recipient_id)
      )
    )
  );

DROP POLICY IF EXISTS "Users can delete own message attachments" ON storage.objects;
CREATE POLICY "Users can delete own message attachments"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'message-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
