-- Table: resume tokens for email-based application recovery
CREATE TABLE public.application_resume_tokens (
  token TEXT NOT NULL PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_application_resume_tokens_email ON public.application_resume_tokens (lower(email));
CREATE INDEX idx_application_resume_tokens_expires_at ON public.application_resume_tokens (expires_at);

ALTER TABLE public.application_resume_tokens ENABLE ROW LEVEL SECURITY;

-- No policies: service-role edge functions bypass RLS; no client reads/writes.

-- Consume a resume token atomically: validates + marks used + returns the draft_token
CREATE OR REPLACE FUNCTION public.consume_application_resume_token(p_token TEXT)
RETURNS TABLE (draft_token TEXT, application_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_app RECORD;
BEGIN
  SELECT * INTO v_row
  FROM public.application_resume_tokens
  WHERE token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_token';
  END IF;

  IF v_row.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'token_used';
  END IF;

  IF v_row.expires_at < now() THEN
    RAISE EXCEPTION 'token_expired';
  END IF;

  UPDATE public.application_resume_tokens
  SET used_at = now()
  WHERE token = p_token;

  SELECT a.draft_token, a.id INTO v_app
  FROM public.applications a
  WHERE a.id = v_row.application_id AND a.is_draft = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'application_not_found';
  END IF;

  draft_token := v_app.draft_token;
  application_id := v_app.id;
  RETURN NEXT;
END;
$$;