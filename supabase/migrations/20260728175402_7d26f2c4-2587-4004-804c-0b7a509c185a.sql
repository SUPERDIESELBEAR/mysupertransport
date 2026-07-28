
-- Threads
CREATE TABLE public.staff_help_threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New chat',
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_staff_help_threads_user ON public.staff_help_threads(user_id, updated_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_help_threads TO authenticated;
GRANT ALL ON public.staff_help_threads TO service_role;
ALTER TABLE public.staff_help_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_help_threads_own_select" ON public.staff_help_threads
  FOR SELECT TO authenticated USING (user_id = auth.uid() AND public.is_staff(auth.uid()));
CREATE POLICY "staff_help_threads_own_insert" ON public.staff_help_threads
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_staff(auth.uid()));
CREATE POLICY "staff_help_threads_own_update" ON public.staff_help_threads
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "staff_help_threads_own_delete" ON public.staff_help_threads
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Messages
CREATE TABLE public.staff_help_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.staff_help_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  follow_ups TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_staff_help_messages_thread ON public.staff_help_messages(thread_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_help_messages TO authenticated;
GRANT ALL ON public.staff_help_messages TO service_role;
ALTER TABLE public.staff_help_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_help_messages_own_select" ON public.staff_help_messages
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "staff_help_messages_own_insert" ON public.staff_help_messages
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_staff(auth.uid()));
CREATE POLICY "staff_help_messages_own_delete" ON public.staff_help_messages
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Analytics query log
CREATE TABLE public.staff_help_query_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES public.staff_help_threads(id) ON DELETE SET NULL,
  query TEXT NOT NULL,
  matched_faq_ids UUID[] NOT NULL DEFAULT '{}',
  matched_help_entry_ids TEXT[] NOT NULL DEFAULT '{}',
  answered_from TEXT NOT NULL CHECK (answered_from IN ('faq','index','overview','none')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_staff_help_query_log_created ON public.staff_help_query_log(created_at DESC);
CREATE INDEX idx_staff_help_query_log_answered_from ON public.staff_help_query_log(answered_from, created_at DESC);
GRANT SELECT, INSERT ON public.staff_help_query_log TO authenticated;
GRANT ALL ON public.staff_help_query_log TO service_role;
ALTER TABLE public.staff_help_query_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_help_query_log_insert_own" ON public.staff_help_query_log
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_staff(auth.uid()));
CREATE POLICY "staff_help_query_log_read_admin" ON public.staff_help_query_log
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'management')
  );

-- updated_at trigger for threads
CREATE TRIGGER staff_help_threads_updated_at
  BEFORE UPDATE ON public.staff_help_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-bump thread updated_at when a new message is added
CREATE OR REPLACE FUNCTION public.bump_staff_help_thread_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.staff_help_threads SET updated_at = now() WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER staff_help_messages_bump_thread
  AFTER INSERT ON public.staff_help_messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_staff_help_thread_updated_at();
