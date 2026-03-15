
-- Message templates for bulk messaging
CREATE TABLE public.message_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

-- All staff can read all templates (shared library)
CREATE POLICY "Staff can view all message templates"
  ON public.message_templates FOR SELECT
  USING (is_staff(auth.uid()));

-- Staff can create templates
CREATE POLICY "Staff can create message templates"
  ON public.message_templates FOR INSERT
  WITH CHECK (is_staff(auth.uid()) AND auth.uid() = created_by);

-- Staff can update their own templates; management can update any
CREATE POLICY "Staff can update own templates"
  ON public.message_templates FOR UPDATE
  USING (auth.uid() = created_by OR has_role(auth.uid(), 'management'::app_role));

-- Staff can delete their own templates; management can delete any
CREATE POLICY "Staff can delete own templates"
  ON public.message_templates FOR DELETE
  USING (auth.uid() = created_by OR has_role(auth.uid(), 'management'::app_role));

-- Auto-update updated_at
CREATE TRIGGER update_message_templates_updated_at
  BEFORE UPDATE ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
