ALTER TABLE public.onboarding_status
  ADD COLUMN IF NOT EXISTS eld_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS eld_verified_by uuid,
  ADD COLUMN IF NOT EXISTS dash_cam_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS dash_cam_verified_by uuid,
  ADD COLUMN IF NOT EXISTS bestpass_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS bestpass_verified_by uuid,
  ADD COLUMN IF NOT EXISTS fuel_card_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS fuel_card_verified_by uuid;

CREATE UNIQUE INDEX IF NOT EXISTS one_active_assignment_per_item
  ON public.equipment_assignments(equipment_id)
  WHERE returned_at IS NULL;