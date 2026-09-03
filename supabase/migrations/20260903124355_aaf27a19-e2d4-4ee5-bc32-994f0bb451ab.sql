CREATE OR REPLACE FUNCTION public.consume_application_resume_token(p_token text)
 RETURNS TABLE(draft_token text, application_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  -- Idempotent reuse window. A token already consumed is accepted again for
  -- this long after its FIRST use, returning the same draft_token.
  --
  -- Why 30 minutes and not longer: the link is already a bearer credential
  -- valid for 24 hours to anyone holding it, so a short window after first use
  -- adds little to a threat model that already includes an unused link sitting
  -- in that inbox for a day. It exists to fix the SECOND TAP, which the data
  -- shows is the dominant real failure (30 of 38 used tokens were consumed
  -- within two minutes of issue; four applicants were stranded, one at the
  -- signature step).
  --
  -- It is deliberately short and MUST NOT be widened without first addressing
  -- what draft_token grants: permanent, unrotatable read/write over every
  -- column of the application row. See docs/tms-build-status.md, KNOWN DEBT
  -- "draft_token is a permanent bearer credential over 82 plaintext columns".
  c_reuse_window CONSTANT interval := interval '30 minutes';

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

  -- Expiry governs absolutely: an expired token is refused whether or not it
  -- falls inside the reuse window. Checked BEFORE the reuse window for that
  -- reason.
  IF v_row.expires_at < now() THEN
    RAISE EXCEPTION 'token_expired';
  END IF;

  IF v_row.used_at IS NOT NULL AND v_row.used_at < now() - c_reuse_window THEN
    RAISE EXCEPTION 'token_used';
  END IF;

  -- Resolve the application FIRST. The previous definition wrote used_at here,
  -- before this read, so a request whose response never reached the browser
  -- still spent the token.
  SELECT a.draft_token, a.id INTO v_app
  FROM public.applications a
  WHERE a.id = v_row.application_id AND a.is_draft = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'application_not_found';
  END IF;

  -- Stamp first use only. Re-use inside the window must not slide the window
  -- forward, or a page that re-consumes on every load would keep the token
  -- alive indefinitely.
  IF v_row.used_at IS NULL THEN
    UPDATE public.application_resume_tokens
    SET used_at = now()
    WHERE token = p_token;
  END IF;

  draft_token := v_app.draft_token;
  application_id := v_app.id;
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_application_resume_token(text) FROM PUBLIC;
-- anon EXECUTE is INTENDED: the public route /apply?resume=<token> is opened by
-- an unauthenticated applicant from an emailed link, via the
-- consume-application-resume edge function. Unchanged by this migration.
GRANT EXECUTE ON FUNCTION public.consume_application_resume_token(text) TO anon, authenticated, service_role;