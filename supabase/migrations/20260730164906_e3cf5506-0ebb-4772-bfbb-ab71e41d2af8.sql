CREATE OR REPLACE FUNCTION public.resolve_share_token(p_token uuid)
RETURNS TABLE(id uuid, name text, file_url text, expires_at date)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tok public.share_tokens%ROWTYPE;
  v_outcome text;
  v_headers json;
  v_ua text;
  v_ip text;
BEGIN
  BEGIN
    v_headers := current_setting('request.headers', true)::json;
    v_ua := v_headers ->> 'user-agent';
    v_ip := COALESCE(v_headers ->> 'x-forwarded-for', v_headers ->> 'cf-connecting-ip');
  EXCEPTION WHEN others THEN
    v_ua := NULL; v_ip := NULL;
  END;

  SELECT * INTO v_tok FROM public.share_tokens t WHERE t.token = p_token;

  IF NOT FOUND THEN
    v_outcome := 'not_found';
  ELSIF v_tok.revoked_at IS NOT NULL THEN
    v_outcome := 'revoked';
  ELSIF v_tok.expires_at IS NOT NULL AND v_tok.expires_at <= now() THEN
    v_outcome := 'expired';
  ELSE
    v_outcome := 'ok';
  END IF;

  INSERT INTO public.share_token_access_log (token, scope, resource_id, outcome, ip_hash, user_agent)
  VALUES (
    p_token,
    v_tok.scope,
    v_tok.resource_id,
    v_outcome,
    CASE WHEN v_ip IS NULL THEN NULL ELSE encode(sha256(convert_to(v_ip, 'UTF8')), 'hex') END,
    left(v_ua, 300)
  );

  IF v_outcome <> 'ok' THEN
    RETURN;
  END IF;

  IF v_tok.scope = 'inspection_document' THEN
    RETURN QUERY
      SELECT d.id, d.name, d.file_url, d.expires_at
      FROM public.inspection_documents d
      WHERE d.id = v_tok.resource_id
      LIMIT 1;
  END IF;

  RETURN;
END;
$$;