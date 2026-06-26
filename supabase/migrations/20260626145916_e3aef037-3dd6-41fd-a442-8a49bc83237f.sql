-- Ball in Court status for onboarding handoff
ALTER TABLE public.onboarding_status
  ADD COLUMN IF NOT EXISTS ball_in_court text NOT NULL DEFAULT 'driver',
  ADD COLUMN IF NOT EXISTS ball_in_court_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS ball_in_court_updated_by uuid;

ALTER TABLE public.onboarding_status
  DROP CONSTRAINT IF EXISTS onboarding_status_ball_in_court_check;
ALTER TABLE public.onboarding_status
  ADD CONSTRAINT onboarding_status_ball_in_court_check
  CHECK (ball_in_court IN ('driver', 'staff'));