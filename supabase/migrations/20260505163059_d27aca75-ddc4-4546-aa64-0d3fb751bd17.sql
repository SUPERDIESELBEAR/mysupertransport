
ALTER TABLE public.operator_broadcasts
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS selected_operator_ids jsonb;

ALTER TABLE public.operator_broadcasts
  DROP CONSTRAINT IF EXISTS operator_broadcasts_status_check;
ALTER TABLE public.operator_broadcasts
  ADD CONSTRAINT operator_broadcasts_status_check
  CHECK (status IN ('draft','scheduled','sending','sent','failed'));

CREATE INDEX IF NOT EXISTS idx_operator_broadcasts_status_scheduled
  ON public.operator_broadcasts (status, scheduled_at);

-- Allow management/owner to UPDATE and DELETE drafts / scheduled
DROP POLICY IF EXISTS "mgmt update broadcasts" ON public.operator_broadcasts;
CREATE POLICY "mgmt update broadcasts"
  ON public.operator_broadcasts FOR UPDATE
  USING (public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner'));

DROP POLICY IF EXISTS "mgmt delete broadcasts" ON public.operator_broadcasts;
CREATE POLICY "mgmt delete broadcasts"
  ON public.operator_broadcasts FOR DELETE
  USING (public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner'));
