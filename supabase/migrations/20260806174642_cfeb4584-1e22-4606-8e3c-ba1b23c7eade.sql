ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birth_month smallint,
  ADD COLUMN IF NOT EXISTS birth_day smallint;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_birth_month_check CHECK (birth_month IS NULL OR (birth_month BETWEEN 1 AND 12)),
  ADD CONSTRAINT profiles_birth_day_check CHECK (birth_day IS NULL OR (birth_day BETWEEN 1 AND 31));

ALTER TABLE public.staff_event_acknowledgments
  ALTER COLUMN operator_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS subject_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.staff_event_acknowledgments
  ADD CONSTRAINT staff_event_ack_subject_check
  CHECK ((operator_id IS NOT NULL) <> (subject_user_id IS NOT NULL));

CREATE UNIQUE INDEX IF NOT EXISTS staff_event_ack_subject_user_unique
  ON public.staff_event_acknowledgments (user_id, subject_user_id, event_type, event_date)
  WHERE subject_user_id IS NOT NULL;