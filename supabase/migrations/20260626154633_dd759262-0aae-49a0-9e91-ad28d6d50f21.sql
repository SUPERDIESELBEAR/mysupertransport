ALTER TABLE public.onboarding_status
  DROP COLUMN IF EXISTS ball_in_court,
  DROP COLUMN IF EXISTS ball_in_court_updated_at,
  DROP COLUMN IF EXISTS ball_in_court_updated_by;