ALTER TABLE public.onboarding_status
  ADD COLUMN IF NOT EXISTS mvr_requested_date DATE,
  ADD COLUMN IF NOT EXISTS mvr_received_date DATE,
  ADD COLUMN IF NOT EXISTS ch_requested_date DATE,
  ADD COLUMN IF NOT EXISTS ch_received_date DATE,
  ADD COLUMN IF NOT EXISTS pe_scheduled_date DATE,
  ADD COLUMN IF NOT EXISTS pe_results_date DATE;