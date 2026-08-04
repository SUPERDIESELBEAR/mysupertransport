ALTER TABLE public.onboarding_status
  ADD COLUMN IF NOT EXISTS ifta_decal_issued text NOT NULL DEFAULT 'no';

ALTER TYPE public.osas_device_type ADD VALUE IF NOT EXISTS 'ifta_decal';