ALTER TABLE public.faq
  ADD COLUMN IF NOT EXISTS source_document TEXT,
  ADD COLUMN IF NOT EXISTS source_section TEXT;

CREATE INDEX IF NOT EXISTS idx_faq_source_document ON public.faq (source_document) WHERE source_document IS NOT NULL;