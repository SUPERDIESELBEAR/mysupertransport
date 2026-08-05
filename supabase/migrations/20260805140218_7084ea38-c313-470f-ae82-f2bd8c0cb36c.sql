CREATE TABLE public.staff_ui_preferences (
  user_id UUID NOT NULL PRIMARY KEY,
  prefs JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_ui_preferences TO authenticated;
GRANT ALL ON public.staff_ui_preferences TO service_role;

ALTER TABLE public.staff_ui_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own UI preferences"
ON public.staff_ui_preferences FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own UI preferences"
ON public.staff_ui_preferences FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own UI preferences"
ON public.staff_ui_preferences FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own UI preferences"
ON public.staff_ui_preferences FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER update_staff_ui_preferences_updated_at
BEFORE UPDATE ON public.staff_ui_preferences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();