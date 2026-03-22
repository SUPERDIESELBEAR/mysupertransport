-- Add new install_method enum values for renamed options
ALTER TYPE public.install_method ADD VALUE IF NOT EXISTS 'owner_operator_install';
ALTER TYPE public.install_method ADD VALUE IF NOT EXISTS 'supertransport_shop';

-- Add decal photo columns to onboarding_status
ALTER TABLE public.onboarding_status
  ADD COLUMN IF NOT EXISTS decal_photo_ds_url TEXT,
  ADD COLUMN IF NOT EXISTS decal_photo_ps_url TEXT;