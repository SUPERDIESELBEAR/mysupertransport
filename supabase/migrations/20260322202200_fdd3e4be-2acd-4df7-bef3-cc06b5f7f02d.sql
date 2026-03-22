ALTER TABLE public.onboarding_status
  ADD COLUMN IF NOT EXISTS mo_docs_submitted_date DATE,
  ADD COLUMN IF NOT EXISTS mo_notes TEXT;