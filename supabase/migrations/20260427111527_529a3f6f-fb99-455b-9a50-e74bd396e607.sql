
-- Throttle table: one row per (sender, recipient) pair tracking last notification
CREATE TABLE IF NOT EXISTS public.message_notification_throttle (
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_notified_at timestamptz NOT NULL DEFAULT now(),
  unread_count integer NOT NULL DEFAULT 1,
  PRIMARY KEY (sender_id, recipient_id)
);

ALTER TABLE public.message_notification_throttle ENABLE ROW LEVEL SECURITY;

-- No public access — only service role (edge functions) reads/writes this table.
-- Intentionally no policies = no access for anon/authenticated users.

CREATE INDEX IF NOT EXISTS idx_msg_throttle_recipient
  ON public.message_notification_throttle (recipient_id);
