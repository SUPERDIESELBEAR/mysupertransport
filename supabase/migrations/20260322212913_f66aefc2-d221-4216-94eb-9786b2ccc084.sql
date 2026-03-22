
-- Add insurance columns to onboarding_status
ALTER TABLE public.onboarding_status
  ADD COLUMN IF NOT EXISTS insurance_policy_type TEXT,
  ADD COLUMN IF NOT EXISTS insurance_stated_value NUMERIC,
  ADD COLUMN IF NOT EXISTS insurance_additional_insured TEXT,
  ADD COLUMN IF NOT EXISTS insurance_cert_holder TEXT,
  ADD COLUMN IF NOT EXISTS insurance_notes TEXT;

-- Create insurance_email_settings table (single-row, persistent)
CREATE TABLE IF NOT EXISTS public.insurance_email_settings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_emails TEXT[] NOT NULL DEFAULT '{}',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    UUID
);

-- Seed one row so it always exists
INSERT INTO public.insurance_email_settings (id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE public.insurance_email_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read insurance email settings"
  ON public.insurance_email_settings FOR SELECT
  TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "Staff can update insurance email settings"
  ON public.insurance_email_settings FOR UPDATE
  TO authenticated
  USING (is_staff(auth.uid()))
  WITH CHECK (is_staff(auth.uid()));
