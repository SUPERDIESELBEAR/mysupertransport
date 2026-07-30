-- 1. share_tokens
CREATE TABLE public.share_tokens (
  token uuid PRIMARY KEY,
  scope text NOT NULL,
  resource_id uuid NOT NULL,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT share_tokens_scope_resource_unique UNIQUE (scope, resource_id)
);
CREATE INDEX idx_share_tokens_resource ON public.share_tokens(scope, resource_id);

GRANT SELECT, INSERT, UPDATE ON public.share_tokens TO authenticated;
GRANT ALL ON public.share_tokens TO service_role;

ALTER TABLE public.share_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view share tokens"
ON public.share_tokens FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'management') OR
  public.has_role(auth.uid(), 'owner') OR
  public.has_role(auth.uid(), 'onboarding_staff') OR
  public.has_role(auth.uid(), 'dispatcher')
);

CREATE POLICY "Staff can create share tokens"
ON public.share_tokens FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'management') OR
  public.has_role(auth.uid(), 'owner') OR
  public.has_role(auth.uid(), 'onboarding_staff') OR
  public.has_role(auth.uid(), 'dispatcher')
);

CREATE POLICY "Management can update share tokens"
ON public.share_tokens FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

-- 2. share_token_access_log
CREATE TABLE public.share_token_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token uuid,
  scope text,
  resource_id uuid,
  outcome text NOT NULL,
  ip_hash text,
  user_agent text,
  accessed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_share_token_access_log_token ON public.share_token_access_log(token, accessed_at DESC);

GRANT SELECT ON public.share_token_access_log TO authenticated;
GRANT ALL ON public.share_token_access_log TO service_role;

ALTER TABLE public.share_token_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Management can view share token access log"
ON public.share_token_access_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

-- 3. Backfill, fail-loud
INSERT INTO public.share_tokens (token, scope, resource_id, expires_at, revoked_at, created_at)
SELECT d.public_share_token, 'inspection_document', d.id, NULL, NULL, COALESCE(d.uploaded_at, now())
FROM public.inspection_documents d
WHERE d.public_share_token IS NOT NULL
ON CONFLICT (token) DO NOTHING;

DO $$
DECLARE
  v_src bigint;
  v_dst bigint;
BEGIN
  SELECT count(*) INTO v_src FROM public.inspection_documents WHERE public_share_token IS NOT NULL;
  SELECT count(*) INTO v_dst FROM public.share_tokens WHERE scope = 'inspection_document';
  IF v_src <> v_dst THEN
    RAISE EXCEPTION 'share_tokens backfill mismatch: % source rows, % backfilled rows', v_src, v_dst;
  END IF;
  RAISE NOTICE 'share_tokens backfill verified: % rows', v_dst;
END $$;

-- 4. Single resolution path
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
    CASE WHEN v_ip IS NULL THEN NULL ELSE encode(digest(v_ip, 'sha256'), 'hex') END,
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

REVOKE ALL ON FUNCTION public.resolve_share_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_share_token(uuid) TO anon, authenticated, service_role;

-- 5. Legacy delegator (drop in the release AFTER the one that ships §8)
CREATE OR REPLACE FUNCTION public.get_inspection_doc_by_token(p_token uuid)
RETURNS TABLE(id uuid, name text, file_url text, expires_at date)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- LEGACY DELEGATOR (§8). Kept for one release so stale cached client bundles
  -- keep resolving AND keep writing share_token_access_log rows.
  -- DROP in the release following the one that ships §8.
  SELECT r.id, r.name, r.file_url, r.expires_at
  FROM public.resolve_share_token(p_token) r;
$$;

COMMENT ON FUNCTION public.get_inspection_doc_by_token(uuid) IS
  'LEGACY (§8): thin delegate to resolve_share_token. Drop in the release following the one that ships §8.';

-- 6. Revocation
CREATE OR REPLACE FUNCTION public.revoke_share_token(p_token uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.share_tokens SET revoked_at = now() WHERE token = p_token AND revoked_at IS NULL;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_share_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_share_token(uuid) TO authenticated, service_role;

-- 7. public_share_token is legacy read-only
CREATE OR REPLACE FUNCTION public.enforce_public_share_token_readonly()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.public_share_token IS DISTINCT FROM OLD.public_share_token THEN
    RAISE EXCEPTION 'inspection_documents.public_share_token is legacy read-only (§8); use share_tokens';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_public_share_token_readonly
BEFORE UPDATE ON public.inspection_documents
FOR EACH ROW EXECUTE FUNCTION public.enforce_public_share_token_readonly();

COMMENT ON COLUMN public.inspection_documents.public_share_token IS
  'LEGACY (§8): read-only. Canonical share tokens live in public.share_tokens.';