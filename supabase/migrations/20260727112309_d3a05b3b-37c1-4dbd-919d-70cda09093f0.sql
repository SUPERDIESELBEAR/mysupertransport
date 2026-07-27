CREATE TABLE IF NOT EXISTS public.dot_consultant_email_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_emails text[] NOT NULL DEFAULT '{}'::text[],
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, UPDATE ON public.dot_consultant_email_settings TO authenticated;
GRANT ALL ON public.dot_consultant_email_settings TO service_role;

ALTER TABLE public.dot_consultant_email_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read dot consultant email settings"
  ON public.dot_consultant_email_settings FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can update dot consultant email settings"
  ON public.dot_consultant_email_settings FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

INSERT INTO public.dot_consultant_email_settings (id, recipient_emails)
VALUES ('00000000-0000-0000-0000-000000000001', ARRAY['tracey@iondot.net'])
ON CONFLICT (id) DO NOTHING;