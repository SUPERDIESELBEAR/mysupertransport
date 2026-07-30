-- Private config store: no grants to anon/authenticated/PUBLIC.
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
REVOKE ALL ON SCHEMA app_private FROM anon, authenticated;
GRANT USAGE ON SCHEMA app_private TO service_role;

CREATE TABLE IF NOT EXISTS app_private.config (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON app_private.config FROM PUBLIC;
REVOKE ALL ON app_private.config FROM anon, authenticated;
GRANT ALL ON app_private.config TO service_role;
ALTER TABLE app_private.config ENABLE ROW LEVEL SECURITY;
-- No policies: reachable only by SECURITY DEFINER functions and service_role.

INSERT INTO app_private.config (key, value)
VALUES ('share_token_ip_salt', encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

-- Track which hashing scheme produced each row.
ALTER TABLE public.share_token_access_log
  ADD COLUMN IF NOT EXISTS hash_version text;

CREATE OR REPLACE FUNCTION public.resolve_share_token(p_token uuid)
 RETURNS TABLE(id uuid, name text, file_url text, expires_at date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_tok public.share_tokens%ROWTYPE;
  v_outcome text;
  v_headers json;
  v_ua text;
  v_ip text;
  v_salt text;
  v_hash text;
  v_hash_version text;
BEGIN
  BEGIN
    v_headers := current_setting('request.headers', true)::json;
    v_ua := v_headers ->> 'user-agent';
    v_ip := COALESCE(v_headers ->> 'x-forwarded-for', v_headers ->> 'cf-connecting-ip');
  EXCEPTION WHEN others THEN
    v_ua := NULL; v_ip := NULL;
  END;

  -- Fail-open: a missing/unreadable salt must never block a legitimate
  -- roadside inspection view. Log the visit with a NULL fingerprint instead.
  BEGIN
    SELECT c.value INTO v_salt FROM app_private.config c
    WHERE c.key = 'share_token_ip_salt';
  EXCEPTION WHEN others THEN
    v_salt := NULL;
  END;

  IF v_ip IS NULL THEN
    v_hash := NULL;
    v_hash_version := 'no_ip';
  ELSIF v_salt IS NULL THEN
    v_hash := NULL;
    v_hash_version := 'v2_salt_unavailable';
  ELSE
    v_hash := encode(
      extensions.digest(convert_to(v_salt || ':' || v_ip, 'UTF8'), 'sha256'),
      'hex'
    );
    v_hash_version := 'v2_sha256_salted';
  END IF;

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

  INSERT INTO public.share_token_access_log
    (token, scope, resource_id, outcome, ip_hash, hash_version, user_agent)
  VALUES (p_token, v_tok.scope, v_tok.resource_id, v_outcome, v_hash, v_hash_version, left(v_ua, 300));

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
$function$;