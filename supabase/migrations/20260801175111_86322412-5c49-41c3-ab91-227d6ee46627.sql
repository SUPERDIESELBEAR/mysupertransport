-- Pass B §7: per-token throttling on the single share-token resolution path,
-- plus the officer_packet scope.
--
-- EXPIRY IS NOT TOUCHED. No ALTER TABLE public.share_tokens, no write to
-- expires_at, no default, no backfill. The resolver's expiry branch is
-- unchanged, so the 693 inspection_document tokens with a NULL expiry (every
-- QR sticker already printed and stuck in a truck) keep resolving forever.

-- 1. Officer packet links. share_tokens has no room for a storage path and
--    must not be altered, so the mapping lives beside it.
CREATE TABLE IF NOT EXISTS public.officer_packet_links (
  token uuid PRIMARY KEY REFERENCES public.share_tokens(token) ON DELETE CASCADE,
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  bucket text NOT NULL DEFAULT 'eld-notices',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_officer_packet_links_operator
  ON public.officer_packet_links(operator_id, created_at DESC);

GRANT SELECT ON public.officer_packet_links TO authenticated;
GRANT ALL ON public.officer_packet_links TO service_role;

ALTER TABLE public.officer_packet_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can view their own officer packet links"
ON public.officer_packet_links FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.operators o
    WHERE o.id = officer_packet_links.operator_id AND o.user_id = auth.uid()
  )
  OR public.is_staff(auth.uid())
);

-- 2. Shared gate: log + per-token throttle, FAIL CLOSED.
--
-- Not anon-executable. Both resolvers are SECURITY DEFINER and run as the
-- owner, so they can reach it; a direct caller cannot.
CREATE OR REPLACE FUNCTION public._share_token_gate(p_token uuid)
RETURNS TABLE(outcome text, scope text, resource_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_tok public.share_tokens%ROWTYPE;
  v_outcome text;
  v_headers json;
  v_ua text;
  v_ip text;
  v_salt text;
  v_hash text;
  v_hash_version text;
  v_recent bigint;
  -- Opens allowed per token per hour. A binder sticker scanned by a shop and
  -- a 4-hour officer link both sit far below this; scripted enumeration of a
  -- leaked token does not.
  c_limit constant bigint := 60;
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
  -- Unchanged: a NULL expiry never expires.
  ELSIF v_tok.expires_at IS NOT NULL AND v_tok.expires_at <= now() THEN
    v_outcome := 'expired';
  ELSE
    -- Per-token throttle. FAIL CLOSED: if the counter cannot be read we do
    -- not know how many times this token has been fetched, and an unlogged,
    -- uncounted fetch of a driver's compliance documents is not something to
    -- serve. Contrast the per-IP limit in the edge function, which fails open.
    BEGIN
      SELECT count(*) INTO v_recent
      FROM public.share_token_access_log l
      WHERE l.token = p_token
        AND l.accessed_at > now() - interval '1 hour'
        AND l.outcome IN ('ok', 'throttled');
    EXCEPTION WHEN others THEN
      v_recent := c_limit + 1;
    END;

    IF v_recent IS NULL OR v_recent >= c_limit THEN
      v_outcome := 'throttled';
    ELSE
      v_outcome := 'ok';
    END IF;
  END IF;

  INSERT INTO public.share_token_access_log
    (token, scope, resource_id, outcome, ip_hash, hash_version, user_agent)
  VALUES (p_token, v_tok.scope, v_tok.resource_id, v_outcome, v_hash, v_hash_version, left(v_ua, 300));

  RETURN QUERY SELECT v_outcome, v_tok.scope, v_tok.resource_id;
END;
$$;

REVOKE ALL ON FUNCTION public._share_token_gate(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._share_token_gate(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public._share_token_gate(uuid) TO service_role;

COMMENT ON FUNCTION public._share_token_gate(uuid) IS
  'Pass B §7: single log + per-token throttle for every share-token scope. Fail-closed on counter error. Never touches expires_at.';

-- 3. The inspection_document resolver now goes through the gate. Same
--    signature, same return shape, same expiry semantics.
CREATE OR REPLACE FUNCTION public.resolve_share_token(p_token uuid)
RETURNS TABLE(id uuid, name text, file_url text, expires_at date)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_gate record;
BEGIN
  SELECT g.outcome, g.scope, g.resource_id INTO v_gate
  FROM public._share_token_gate(p_token) g;

  IF v_gate.outcome IS DISTINCT FROM 'ok' THEN
    RETURN;
  END IF;

  IF v_gate.scope = 'inspection_document' THEN
    RETURN QUERY
      SELECT d.id, d.name, d.file_url, d.expires_at
      FROM public.inspection_documents d
      WHERE d.id = v_gate.resource_id
      LIMIT 1;
  END IF;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_share_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_share_token(uuid) TO anon, authenticated, service_role;

-- 4. Officer packet resolution. Same gate, so the same log row and the same
--    per-token ceiling apply. Returns the storage location only; the edge
--    function streams the bytes with the service role, so no signed storage
--    URL ever leaves the server.
CREATE OR REPLACE FUNCTION public.resolve_officer_packet_token(p_token uuid)
RETURNS TABLE(operator_id uuid, bucket text, storage_path text, expires_at timestamptz)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_gate record;
BEGIN
  SELECT g.outcome, g.scope, g.resource_id INTO v_gate
  FROM public._share_token_gate(p_token) g;

  IF v_gate.outcome IS DISTINCT FROM 'ok' OR v_gate.scope IS DISTINCT FROM 'officer_packet' THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT l.operator_id, l.bucket, l.storage_path, t.expires_at
    FROM public.officer_packet_links l
    JOIN public.share_tokens t ON t.token = l.token
    WHERE l.token = p_token
    LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_officer_packet_token(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_officer_packet_token(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_officer_packet_token(uuid) TO service_role;

-- 5. Revocation: management/owner as before, plus the driver who owns an
--    officer_packet token. A driver must be able to kill their own link from
--    the roadside screen without calling the office.
CREATE OR REPLACE FUNCTION public.revoke_share_token(p_token uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_allowed boolean := false;
BEGIN
  IF coalesce(public.has_role(auth.uid(), 'management'), false) IS TRUE
     OR coalesce(public.has_role(auth.uid(), 'owner'), false) IS TRUE THEN
    v_allowed := true;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.officer_packet_links l
      JOIN public.operators o ON o.id = l.operator_id
      WHERE l.token = p_token AND o.user_id = auth.uid()
    ) INTO v_allowed;
  END IF;

  IF v_allowed IS NOT TRUE THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.share_tokens SET revoked_at = now() WHERE token = p_token AND revoked_at IS NULL;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_share_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_share_token(uuid) TO authenticated, service_role;