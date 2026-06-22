
ALTER TABLE public.operator_broadcasts
  ADD COLUMN IF NOT EXISTS requires_acknowledgment boolean NOT NULL DEFAULT false;

ALTER TABLE public.operator_broadcast_recipients
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS track_token text;

-- Backfill tokens for existing rows
UPDATE public.operator_broadcast_recipients
   SET track_token = encode(gen_random_bytes(18), 'hex')
 WHERE track_token IS NULL;

CREATE INDEX IF NOT EXISTS idx_obr_broadcast_ack
  ON public.operator_broadcast_recipients (broadcast_id, acknowledged_at);

CREATE INDEX IF NOT EXISTS idx_obr_track_token
  ON public.operator_broadcast_recipients (track_token);

-- Allow operators to read their own recipient rows
DROP POLICY IF EXISTS "Operators can view own broadcast recipient rows"
  ON public.operator_broadcast_recipients;
CREATE POLICY "Operators can view own broadcast recipient rows"
  ON public.operator_broadcast_recipients
  FOR SELECT
  TO authenticated
  USING (
    operator_id IN (
      SELECT id FROM public.operators WHERE user_id = auth.uid()
    )
  );

-- Allow operators to update read/ack on their own row
DROP POLICY IF EXISTS "Operators can mark own broadcast read or acknowledged"
  ON public.operator_broadcast_recipients;
CREATE POLICY "Operators can mark own broadcast read or acknowledged"
  ON public.operator_broadcast_recipients
  FOR UPDATE
  TO authenticated
  USING (
    operator_id IN (
      SELECT id FROM public.operators WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    operator_id IN (
      SELECT id FROM public.operators WHERE user_id = auth.uid()
    )
  );

-- Allow operators to read broadcasts addressed to them (for the inbox in Phase 2 and current visibility)
DROP POLICY IF EXISTS "Operators can view broadcasts addressed to them"
  ON public.operator_broadcasts;
CREATE POLICY "Operators can view broadcasts addressed to them"
  ON public.operator_broadcasts
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT broadcast_id FROM public.operator_broadcast_recipients
       WHERE operator_id IN (SELECT id FROM public.operators WHERE user_id = auth.uid())
    )
  );
