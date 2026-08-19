CREATE TABLE public.user_view_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  view_key text NOT NULL,
  visible_columns jsonb,
  sort_column text,
  sort_direction text CHECK (sort_direction IN ('asc','desc')),
  page_size integer,
  filters jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_view_preferences_user_view_unique UNIQUE (user_id, view_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_view_preferences TO authenticated;
GRANT ALL ON public.user_view_preferences TO service_role;

ALTER TABLE public.user_view_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_view_preferences_select_own" ON public.user_view_preferences
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_view_preferences_insert_own" ON public.user_view_preferences
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_view_preferences_update_own" ON public.user_view_preferences
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_view_preferences_delete_own" ON public.user_view_preferences
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX idx_user_view_preferences_user_view ON public.user_view_preferences (user_id, view_key);

CREATE TRIGGER update_user_view_preferences_updated_at
  BEFORE UPDATE ON public.user_view_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();