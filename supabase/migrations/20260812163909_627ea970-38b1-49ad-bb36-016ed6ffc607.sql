CREATE TABLE IF NOT EXISTS public.onboard_assignment_sheet_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id uuid NOT NULL REFERENCES public.onboard_assignment_sheets(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_by uuid,
  sent_by_name text,
  recipient_email text,
  kind text NOT NULL DEFAULT 'resend',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_osas_sends_sheet ON public.onboard_assignment_sheet_sends(sheet_id, sent_at DESC);

GRANT SELECT, INSERT ON public.onboard_assignment_sheet_sends TO authenticated;
GRANT ALL ON public.onboard_assignment_sheet_sends TO service_role;

ALTER TABLE public.onboard_assignment_sheet_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage osas sends"
  ON public.onboard_assignment_sheet_sends FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'onboarding_staff')
    OR public.has_role(auth.uid(), 'dispatcher')
    OR EXISTS (
      SELECT 1 FROM public.onboard_assignment_sheets s
      JOIN public.operators o ON o.id = s.operator_id
      WHERE s.id = onboard_assignment_sheet_sends.sheet_id
        AND o.user_id = auth.uid()
    )
  );

CREATE POLICY "Staff insert osas sends"
  ON public.onboard_assignment_sheet_sends FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'onboarding_staff')
    OR public.has_role(auth.uid(), 'dispatcher')
  );

INSERT INTO public.onboard_assignment_sheet_sends (sheet_id, sent_at, kind)
SELECT s.id, s.sent_at, 'initial'
FROM public.onboard_assignment_sheets s
WHERE s.sent_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.onboard_assignment_sheet_sends x WHERE x.sheet_id = s.id
  );