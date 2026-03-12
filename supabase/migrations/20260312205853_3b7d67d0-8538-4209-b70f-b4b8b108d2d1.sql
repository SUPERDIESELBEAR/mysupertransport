-- Drop the unique constraint so every reminder attempt creates a new history row
ALTER TABLE public.cert_reminders
  DROP CONSTRAINT IF EXISTS cert_reminders_operator_id_doc_type_key;

-- Add an index for fast lookups by operator+doc_type (replace the unique constraint)
CREATE INDEX IF NOT EXISTS idx_cert_reminders_operator_doc
  ON public.cert_reminders (operator_id, doc_type, sent_at DESC);