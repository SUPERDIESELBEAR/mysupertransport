CREATE TABLE public.preview_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  target_user_id UUID NOT NULL,
  created_by UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_preview_sessions_target ON public.preview_sessions(target_user_id);
CREATE INDEX idx_preview_sessions_created_by ON public.preview_sessions(created_by);

GRANT ALL ON public.preview_sessions TO service_role;

ALTER TABLE public.preview_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No client access to preview sessions"
ON public.preview_sessions
FOR ALL
USING (false)
WITH CHECK (false);

CREATE TRIGGER update_preview_sessions_updated_at
BEFORE UPDATE ON public.preview_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();