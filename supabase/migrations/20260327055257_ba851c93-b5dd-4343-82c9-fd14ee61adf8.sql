ALTER TABLE public.applications
  ADD COLUMN mvr_status public.mvr_status NOT NULL DEFAULT 'not_started',
  ADD COLUMN ch_status public.mvr_status NOT NULL DEFAULT 'not_started',
  ADD COLUMN background_verification_notes text;