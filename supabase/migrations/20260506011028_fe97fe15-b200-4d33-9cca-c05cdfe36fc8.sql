ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS revision_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS revision_requested_by uuid,
  ADD COLUMN IF NOT EXISTS revision_request_message text,
  ADD COLUMN IF NOT EXISTS revision_count integer NOT NULL DEFAULT 0;