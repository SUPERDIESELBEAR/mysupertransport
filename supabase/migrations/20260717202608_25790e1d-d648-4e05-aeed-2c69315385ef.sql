
-- 1. Columns
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'watch',
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_to uuid,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_priority_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_priority_check
  CHECK (priority IN ('action','watch','fyi'));

-- 2. Backfill priority from type
UPDATE public.notifications
SET priority = CASE
  WHEN type IN (
    'new_application','pay_setup_submitted','truck_down',
    'application_denied','docs_uploaded','document_uploaded',
    'new_message','pei_correction_requested'
  ) THEN 'action'
  WHEN type IN (
    'onboarding_milestone','dispatch_status_change',
    'compliance_update','release_note','application_approved'
  ) THEN 'watch'
  ELSE 'fyi'
END
WHERE priority = 'watch';

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_priority_sent
  ON public.notifications (user_id, priority, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_snoozed
  ON public.notifications (user_id, read_at, snoozed_until);
CREATE INDEX IF NOT EXISTS idx_notifications_assigned_to
  ON public.notifications (assigned_to)
  WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_archived
  ON public.notifications (user_id, archived_at)
  WHERE archived_at IS NULL;

-- 4. Policy: allow assignee to also update (recipient already covered by existing policies).
--    Drop any prior version we may have created, then add a permissive UPDATE for assignee.
DROP POLICY IF EXISTS "Assignee can update notification triage" ON public.notifications;
CREATE POLICY "Assignee can update notification triage"
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (assigned_to = auth.uid())
  WITH CHECK (assigned_to = auth.uid() OR user_id = auth.uid());
