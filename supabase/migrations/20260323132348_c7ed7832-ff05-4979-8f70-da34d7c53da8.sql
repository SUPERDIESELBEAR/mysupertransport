
ALTER TABLE public.onboarding_status
  ADD COLUMN IF NOT EXISTS eld_serial_number   TEXT NULL,
  ADD COLUMN IF NOT EXISTS dash_cam_number      TEXT NULL,
  ADD COLUMN IF NOT EXISTS bestpass_number      TEXT NULL,
  ADD COLUMN IF NOT EXISTS fuel_card_number     TEXT NULL;
