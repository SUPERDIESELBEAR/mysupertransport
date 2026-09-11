-- Legacy offboarding support (additive only).
--
-- Drivers who started before SUPERDRIVE have a real signed ICA and real
-- equipment, but no rows in ica_contracts / onboard_assignment_sheets, so
-- offboarding steps 4, 5 and 8 skip themselves. These columns let staff record
-- what already exists on paper without special-casing the offboarding flow.

-- 1. Paper-original ICA, mirroring the pattern already proven on
--    onboard_assignment_sheets. Scan upload is optional.
ALTER TABLE public.ica_contracts
  ADD COLUMN IF NOT EXISTS is_paper_original boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paper_scan_path text,
  ADD COLUMN IF NOT EXISTS paper_scan_name text,
  ADD COLUMN IF NOT EXISTS paper_recorded_by uuid,
  ADD COLUMN IF NOT EXISTS paper_recorded_at timestamptz;

COMMENT ON COLUMN public.ica_contracts.is_paper_original IS
  'True when this row records an agreement signed outside SUPERDRIVE. A scan may or may not be on file.';

-- 2. Return-only assignment sheet: built retroactively at offboarding so the
--    equipment return can be tracked. Never issued or signed at onboarding.
ALTER TABLE public.onboard_assignment_sheets
  ADD COLUMN IF NOT EXISTS is_return_only boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.onboard_assignment_sheets.is_return_only IS
  'True when the sheet was created during offboarding purely to track the return of equipment issued before SUPERDRIVE.';