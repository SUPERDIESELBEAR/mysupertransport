ALTER TABLE public.driver_documents
  ADD COLUMN IF NOT EXISTS pdf_url  text,
  ADD COLUMN IF NOT EXISTS pdf_path text,
  ADD COLUMN IF NOT EXISTS content_type text NOT NULL DEFAULT 'rich_text';