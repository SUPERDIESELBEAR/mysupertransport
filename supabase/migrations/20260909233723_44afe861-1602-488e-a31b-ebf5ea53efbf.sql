-- Offboarding unification: soft-void ICAs, and record the two decal-removal
-- photos on the assignment sheet the driver returns equipment against.

-- 1. ICA contracts are voided, never deleted, so the record survives offboarding.
ALTER TABLE public.ica_contracts
  ADD COLUMN IF NOT EXISTS voided_at   timestamptz,
  ADD COLUMN IF NOT EXISTS void_reason text,
  ADD COLUMN IF NOT EXISTS voided_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ica_contracts_active_idx
  ON public.ica_contracts (operator_id)
  WHERE voided_at IS NULL;

COMMENT ON COLUMN public.ica_contracts.voided_at IS
  'Set when the agreement is ended during offboarding. A voided contract is retained and never counted as active.';

-- 2. Decal removal proof: driver-side and passenger-side photos of the truck
--    with the SUPERTRANSPORT logo and DOT/unit numbers removed.
ALTER TABLE public.onboard_assignment_sheets
  ADD COLUMN IF NOT EXISTS decal_photo_driver_side_url    text,
  ADD COLUMN IF NOT EXISTS decal_photo_passenger_side_url text,
  ADD COLUMN IF NOT EXISTS decal_photos_uploaded_at       timestamptz,
  ADD COLUMN IF NOT EXISTS decal_photos_uploaded_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.onboard_assignment_sheets.decal_photo_driver_side_url IS
  'Driver-side photo proving carrier decals and DOT/unit numbers were removed at offboarding.';