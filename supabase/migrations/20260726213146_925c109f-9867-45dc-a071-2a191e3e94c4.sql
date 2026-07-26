ALTER TABLE public.passenger_authorizations
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by uuid,
  ADD COLUMN IF NOT EXISTS revoke_reason text;

CREATE INDEX IF NOT EXISTS passenger_authorizations_operator_status_idx
  ON public.passenger_authorizations (operator_id, status);