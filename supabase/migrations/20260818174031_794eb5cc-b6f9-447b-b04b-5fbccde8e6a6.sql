ALTER TABLE public.onboard_assignment_sheets
  ADD COLUMN IF NOT EXISTS is_paper_original boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paper_scan_path text,
  ADD COLUMN IF NOT EXISTS paper_scan_name text,
  ADD COLUMN IF NOT EXISTS recorded_by uuid,
  ADD COLUMN IF NOT EXISTS recorded_by_name text,
  ADD COLUMN IF NOT EXISTS recorded_at timestamptz;