ALTER TABLE public.onboarding_status
  ADD COLUMN IF NOT EXISTS cost_mo_registration NUMERIC,
  ADD COLUMN IF NOT EXISTS cost_form_2290 NUMERIC,
  ADD COLUMN IF NOT EXISTS cost_other NUMERIC,
  ADD COLUMN IF NOT EXISTS cost_other_description TEXT,
  ADD COLUMN IF NOT EXISTS cost_notes TEXT;