ALTER TABLE public.cert_reminders
  ADD COLUMN IF NOT EXISTS email_sent boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_error text NULL;