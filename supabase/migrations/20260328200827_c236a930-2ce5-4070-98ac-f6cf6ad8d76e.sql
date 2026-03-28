
CREATE TABLE public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_key TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  heading TEXT NOT NULL,
  body_html TEXT NOT NULL,
  cta_label TEXT NOT NULL DEFAULT 'View My Onboarding Progress',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Management can read email templates"
  ON public.email_templates FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Management can update email templates"
  ON public.email_templates FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Management can insert email templates"
  ON public.email_templates FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Management can delete email templates"
  ON public.email_templates FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));
