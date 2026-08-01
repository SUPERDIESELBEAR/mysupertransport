-- Pass B §7 refinement: correct the throttle counter and surface the
-- `throttled` outcome to the caller.
--
-- TWO CORRECTIONS, NO CHANGE TO EXPIRY SEMANTICS.
--
-- 1. The counter counted `outcome IN ('ok','throttled')`. That is wrong: a
--    refused attempt extended the lockout, so anyone hammering a link kept it
--    dark indefinitely and the driver could never get back in by waiting. The
--    window now counts SERVED opens only (`outcome = 'ok'`). Throttled
--    attempts are still written to share_token_access_log — they are the
--    evidence of the abuse — they just no longer feed the ceiling.
--
-- 2. `throttled` was indistinguishable from `revoked`/`expired`/unknown at the
--    caller, so a driver whose sticker was hammered saw "Document Not Found"
--    and had no reason to try again. resolve_share_token now returns a row
--    carrying the outcome so the viewer can say "too many opens, wait".
--    This leaks only "this token exists and is rate-limited", which the
--    attacker causing it already knows.
--
-- THE CEILING: 60 served opens per token per rolling hour.
--   worst legitimate hour, officer packet (4h link):   ~4-6 opens
--   worst legitimate hour, QR sticker at a shop/scale: ~10-20 opens
--                    (several officers, retries, one re-scan per document)
--   ceiling:                                              60
-- Roughly 3x headroom over the worst honest case, while scripted enumeration
-- of a leaked token dies in the first minute.

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
  -- Served opens allowed per token per rolling hour. See the header block for
  -- the usage numbers this is sized against.
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
    -- serve. Contrast the per-IP guard in the edge function, which fails open.
    --
    -- SERVED OPENS ONLY. A throttled attempt must not extend the lockout.
    BEGIN
      SELECT count(*) INTO v_recent
      FROM public.share_token_access_log l
      WHERE l.token = p_token
        AND l.accessed_at > now() - interval '1 hour'
        AND l.outcome = 'ok';
    EXCEPTION WHEN others THEN
      v_recent := c_limit + 1;
    END;

    IF v_recent IS NULL OR v_recent >= c_limit THEN
      v_outcome := 'throttled';
    ELSE
      v_outcome := 'ok';
    END IF;
  END IF;

  -- Throttled attempts are still logged. They are the abuse record; they just
  -- do not count toward the ceiling above.
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
  'Pass B §7: single log + per-token throttle (60 SERVED opens/hour) for every share-token scope. Throttled attempts are logged but do not extend the window. Fail-closed on counter error. Never touches expires_at.';

-- resolve_share_token gains a fifth column, `outcome`, so the roadside viewer
-- can tell "rate-limited, try again" apart from "gone". Return type changes
-- cannot be done with CREATE OR REPLACE.
DROP FUNCTION IF EXISTS public.resolve_share_token(uuid);

CREATE FUNCTION public.resolve_share_token(p_token uuid)
RETURNS TABLE(id uuid, name text, file_url text, expires_at date, outcome text)
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

  IF v_gate.outcome = 'throttled' THEN
    -- Only the throttled state is disclosed. revoked / expired / unknown still
    -- return nothing at all and render identically.
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, NULL::date, 'throttled'::text;
    RETURN;
  END IF;

  IF v_gate.outcome IS DISTINCT FROM 'ok' THEN
    RETURN;
  END IF;

  IF v_gate.scope = 'inspection_document' THEN
    RETURN QUERY
      SELECT d.id, d.name, d.file_url, d.expires_at, 'ok'::text
      FROM public.inspection_documents d
      WHERE d.id = v_gate.resource_id
      LIMIT 1;
  END IF;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_share_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_share_token(uuid) TO anon, authenticated, service_role;

-- Same treatment for the officer packet resolver, so the download endpoint can
-- answer 429 instead of 404 when the link is merely rate-limited.
DROP FUNCTION IF EXISTS public.resolve_officer_packet_token(uuid);

CREATE FUNCTION public.resolve_officer_packet_token(p_token uuid)
RETURNS TABLE(operator_id uuid, bucket text, storage_path text, expires_at timestamptz, outcome text)
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

  IF v_gate.outcome = 'throttled' THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, NULL::timestamptz, 'throttled'::text;
    RETURN;
  END IF;

  IF v_gate.outcome IS DISTINCT FROM 'ok' OR v_gate.scope IS DISTINCT FROM 'officer_packet' THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT l.operator_id, l.bucket, l.storage_path, t.expires_at, 'ok'::text
    FROM public.officer_packet_links l
    JOIN public.share_tokens t ON t.token = l.token
    WHERE l.token = p_token
    LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_officer_packet_token(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_officer_packet_token(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_officer_packet_token(uuid) TO service_role;
