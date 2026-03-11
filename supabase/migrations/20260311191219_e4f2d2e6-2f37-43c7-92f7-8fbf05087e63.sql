
-- Table to track manual cert reminder sends
CREATE TABLE public.cert_reminders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id   uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  doc_type      text NOT NULL CHECK (doc_type IN ('CDL', 'Medical Cert')),
  sent_at       timestamp with time zone NOT NULL DEFAULT now(),
  sent_by       uuid,
  sent_by_name  text,
  UNIQUE (operator_id, doc_type)
);

ALTER TABLE public.cert_reminders ENABLE ROW LEVEL SECURITY;

-- Staff can insert / upsert reminder records
CREATE POLICY "Staff can insert cert reminders"
  ON public.cert_reminders FOR INSERT
  WITH CHECK (is_staff(auth.uid()));

-- Staff can update (upsert) reminder records
CREATE POLICY "Staff can update cert reminders"
  ON public.cert_reminders FOR UPDATE
  USING (is_staff(auth.uid()));

-- Staff can read all reminder records
CREATE POLICY "Staff can view cert reminders"
  ON public.cert_reminders FOR SELECT
  USING (is_staff(auth.uid()));
