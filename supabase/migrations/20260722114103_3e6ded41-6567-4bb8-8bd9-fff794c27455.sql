
ALTER TABLE public.passenger_authorizations
  ADD COLUMN IF NOT EXISTS passenger_age integer,
  ADD COLUMN IF NOT EXISTS origin_city_state text,
  ADD COLUMN IF NOT EXISTS destination_city_state text,
  ADD COLUMN IF NOT EXISTS expires_at date,
  ADD COLUMN IF NOT EXISTS passenger_initials text,
  ADD COLUMN IF NOT EXISTS parent_initials text,
  ADD COLUMN IF NOT EXISTS contractor_read_acknowledged_at timestamptz;
