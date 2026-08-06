ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS approved_at timestamptz;

UPDATE public.applications
SET approved_at = reviewed_at
WHERE review_status = 'approved' AND approved_at IS NULL AND reviewed_at IS NOT NULL;