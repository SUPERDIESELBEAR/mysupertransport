DO $$
DECLARE
  v_driver uuid := '7e356f94-ce4a-47aa-8883-0e6b01d09aab';
  v_mgmt uuid;
  v_share text := 'scratchsharetoken-' || gen_random_uuid()::text;
  v_code text;
  v_code2 text;
  v_tok uuid := gen_random_uuid();
  v_msg text;
  v_revoked timestamptz;
  v_ok boolean;
BEGIN
  SELECT ur.user_id INTO v_mgmt FROM public.user_roles ur WHERE ur.role IN ('management','owner') LIMIT 1;
  IF v_mgmt IS NULL THEN RAISE EXCEPTION 'fixture: no management user found'; END IF;

  ---------------------------------------------------------------- verification 4
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_driver::text, 'role','authenticated')::text, true);
  v_code := public.get_or_create_short_link(v_share);
  IF NOT EXISTS (SELECT 1 FROM public.document_short_links WHERE code = v_code AND share_token = v_share AND created_by = v_driver) THEN
    RAISE EXCEPTION 'fixture: short link row did not land';
  END IF;
  v_code2 := public.get_or_create_short_link(v_share);
  IF v_code2 <> v_code THEN RAISE EXCEPTION 'fixture: short link not idempotent (% vs %)', v_code, v_code2; END IF;
  RAISE NOTICE 'V4 OK -> code=% idempotent=% rows=%', v_code, (v_code = v_code2),
    (SELECT count(*) FROM public.document_short_links WHERE share_token = v_share);

  ---------------------------------------------------------------- verification 3b
  INSERT INTO public.share_tokens (token, scope, resource_id, created_by)
  VALUES (v_tok, 'scratch_audit', gen_random_uuid(), v_mgmt);

  BEGIN
    v_ok := public.revoke_share_token(v_tok);
    RAISE EXCEPTION 'fixture: driver revoke was NOT refused';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg LIKE 'fixture:%' THEN RAISE; END IF;
    RAISE NOTICE 'V3b DRIVER REFUSED -> %', v_msg;
  END;

  SELECT revoked_at INTO v_revoked FROM public.share_tokens WHERE token = v_tok;
  IF v_revoked IS NOT NULL THEN RAISE EXCEPTION 'fixture: token was revoked despite refusal'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_mgmt::text, 'role','authenticated')::text, true);
  v_ok := public.revoke_share_token(v_tok);
  SELECT revoked_at INTO v_revoked FROM public.share_tokens WHERE token = v_tok;
  IF v_ok IS NOT TRUE OR v_revoked IS NULL THEN RAISE EXCEPTION 'fixture: management revoke failed'; END IF;
  RAISE NOTICE 'V3b MGMT OK -> returned=% revoked_at=%', v_ok, v_revoked;

  ---------------------------------------------------------------- cleanup
  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM set_config('rods.privileged','on', true);
  DELETE FROM public.rods_events WHERE rods_day_id IN
    (SELECT id FROM public.rods_days WHERE log_date IN (DATE '2001-01-02', DATE '2001-01-03'));
  -- The delete guard has no privileged escape by design (certified logs are federal
  -- records). Unlock the scratch rows first, keeping status = 'certified' so the
  -- deferred continuity trigger never fires, then delete them.
  UPDATE public.rods_days SET locked = false
   WHERE log_date IN (DATE '2001-01-02', DATE '2001-01-03');
  DELETE FROM public.rods_days WHERE log_date IN (DATE '2001-01-02', DATE '2001-01-03');
  PERFORM set_config('rods.privileged','off', true);
  DELETE FROM public.document_short_links WHERE share_token = v_share;
  DELETE FROM public.share_tokens WHERE token = v_tok;

  IF EXISTS (SELECT 1 FROM public.rods_days WHERE log_date IN (DATE '2001-01-02', DATE '2001-01-03'))
     OR EXISTS (SELECT 1 FROM public.document_short_links WHERE share_token = v_share)
     OR EXISTS (SELECT 1 FROM public.share_tokens WHERE token = v_tok) THEN
    RAISE EXCEPTION 'fixture: cleanup incomplete';
  END IF;
  RAISE NOTICE 'CLEANUP OK';
END $$;