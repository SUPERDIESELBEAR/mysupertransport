ALTER TABLE public.onboarding_status
  ADD COLUMN IF NOT EXISTS ica_sent_date DATE,
  ADD COLUMN IF NOT EXISTS ica_signed_date DATE,
  ADD COLUMN IF NOT EXISTS ica_notes TEXT;