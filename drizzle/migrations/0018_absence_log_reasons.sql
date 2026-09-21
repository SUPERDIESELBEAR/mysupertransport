-- Absence Log: a dated, attributable reason for every day a driver is off the road.
--
-- The per-day table (dispatch_daily_log) already carries a free-text `notes`
-- column that has never been written to (6,039 rows, all NULL). This makes the
-- reason countable rather than guessed from prose, and records who entered it.
--
-- Additive only: no column is dropped, renamed or retyped.
--
-- Undo (for the record, not run here):
--   ALTER TABLE public.dispatch_daily_log
--     DROP COLUMN IF EXISTS absence_reason,
--     DROP COLUMN IF EXISTS notes_by,
--     DROP COLUMN IF EXISTS notes_at;
--   DROP TYPE IF EXISTS public.absence_reason;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'absence_reason' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.absence_reason AS ENUM (
      'truck_down',
      'home_time',
      'vacation',
      'medical',
      'personal',
      'waiting_on_load',
      'no_driver',
      'other'
    );
  END IF;
END $$;

ALTER TABLE public.dispatch_daily_log
  ADD COLUMN IF NOT EXISTS absence_reason public.absence_reason,
  -- Plain uuid, no FK — matches the existing `created_by` on this table, which
  -- holds the auth user id rather than a profiles row id.
  ADD COLUMN IF NOT EXISTS notes_by uuid,
  ADD COLUMN IF NOT EXISTS notes_at timestamptz;

COMMENT ON COLUMN public.dispatch_daily_log.absence_reason IS
  'Why the driver was off the road that day. NULL when status = dispatched.';
COMMENT ON COLUMN public.dispatch_daily_log.notes_by IS
  'Auth user id of whoever entered the reason/note. Distinct from created_by, which is rewritten when the status is re-set.';
COMMENT ON COLUMN public.dispatch_daily_log.notes_at IS
  'When the reason/note was last entered.';

-- Reading the log back is always "one operator, one date window".
CREATE INDEX IF NOT EXISTS dispatch_daily_log_operator_date_idx
  ON public.dispatch_daily_log (operator_id, log_date DESC);

-- Existing RLS policies and GRANTs on dispatch_daily_log already cover these
-- columns; no policy change is required for an additive column.
