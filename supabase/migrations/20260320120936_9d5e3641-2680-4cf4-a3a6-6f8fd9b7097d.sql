-- Create the application_invites table to track prospective applicant outreach
CREATE TABLE public.application_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  note TEXT,
  invited_by UUID NOT NULL,
  invited_by_name TEXT,
  email_sent BOOLEAN NOT NULL DEFAULT false,
  email_error TEXT,
  resent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.application_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can insert application invites"
  ON public.application_invites FOR INSERT
  WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Staff can view application invites"
  ON public.application_invites FOR SELECT
  USING (is_staff(auth.uid()));

CREATE POLICY "Staff can update application invites"
  ON public.application_invites FOR UPDATE
  USING (is_staff(auth.uid()));

CREATE POLICY "Management can delete application invites"
  ON public.application_invites FOR DELETE
  USING (has_role(auth.uid(), 'management'::app_role));