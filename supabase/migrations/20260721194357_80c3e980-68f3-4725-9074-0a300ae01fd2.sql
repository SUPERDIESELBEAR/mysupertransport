ALTER TABLE public.passenger_authorizations
  ADD COLUMN IF NOT EXISTS passenger_signature_waived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS passenger_waiver_reason text;