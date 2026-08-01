ALTER TABLE public.eld_malfunction_events
  ADD COLUMN IF NOT EXISTS extension_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS extension_granted_at   timestamptz,
  ADD COLUMN IF NOT EXISTS extension_granted_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS extension_expires_on   date,
  ADD COLUMN IF NOT EXISTS extension_notes        text;

ALTER TABLE public.eld_malfunction_notifications
  DROP CONSTRAINT IF EXISTS eld_malfunction_notifications_notification_type_check;

ALTER TABLE public.eld_malfunction_notifications
  ADD CONSTRAINT eld_malfunction_notifications_notification_type_check
  CHECK (notification_type = ANY (ARRAY[
    'escalation_day'::text,
    'ack_overdue'::text,
    'digest'::text,
    'extension_prompt'::text,
    'notice_stuck'::text,
    'pause_lapsed'::text
  ]));

CREATE INDEX IF NOT EXISTS idx_eld_events_escalation_scan
  ON public.eld_malfunction_events (discovered_at)
  WHERE status = 'open';

COMMENT ON COLUMN public.eld_malfunction_events.extension_expires_on IS
  'End date of a granted 395.34(d)(2) extension. The 5-day filing window itself keys on created_at (driver notification), not discovered_at.';