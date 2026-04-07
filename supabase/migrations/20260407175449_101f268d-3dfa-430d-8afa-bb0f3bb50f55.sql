
CREATE TABLE public.carrier_signature_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  typed_name text NOT NULL,
  title text NOT NULL,
  signature_url text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

-- Singleton: only one row ever
CREATE UNIQUE INDEX carrier_signature_settings_singleton ON public.carrier_signature_settings ((true));

ALTER TABLE public.carrier_signature_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view carrier signature settings"
  ON public.carrier_signature_settings FOR SELECT
  USING (is_staff(auth.uid()));

CREATE POLICY "Management can insert carrier signature settings"
  ON public.carrier_signature_settings FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Management can update carrier signature settings"
  ON public.carrier_signature_settings FOR UPDATE
  USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Management can delete carrier signature settings"
  ON public.carrier_signature_settings FOR DELETE
  USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role));

CREATE TRIGGER update_carrier_sig_settings_updated_at
  BEFORE UPDATE ON public.carrier_signature_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
