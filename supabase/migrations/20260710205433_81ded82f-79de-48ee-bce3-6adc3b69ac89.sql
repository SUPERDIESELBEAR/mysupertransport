CREATE TABLE IF NOT EXISTS public.staff_event_acknowledgments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('birthday', 'anniversary')),
  event_date date NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, operator_id, event_type, event_date)
);
CREATE INDEX IF NOT EXISTS idx_staff_event_ack_user
  ON public.staff_event_acknowledgments (user_id, event_date);
GRANT SELECT, INSERT, DELETE ON public.staff_event_acknowledgments TO authenticated;
GRANT ALL ON public.staff_event_acknowledgments TO service_role;
ALTER TABLE public.staff_event_acknowledgments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read own acknowledgments"
  ON public.staff_event_acknowledgments FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Staff can insert own acknowledgments"
  ON public.staff_event_acknowledgments FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Staff can delete own acknowledgments"
  ON public.staff_event_acknowledgments FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());