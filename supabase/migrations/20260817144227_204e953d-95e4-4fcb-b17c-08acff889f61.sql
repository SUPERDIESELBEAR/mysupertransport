ALTER TABLE public.onboard_assignment_sheets
  ADD COLUMN IF NOT EXISTS cdl_number text,
  ADD COLUMN IF NOT EXISTS cdl_state text,
  ADD COLUMN IF NOT EXISTS cdl_expiration date;