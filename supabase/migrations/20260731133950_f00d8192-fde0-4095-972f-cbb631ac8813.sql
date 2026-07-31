CREATE OR REPLACE FUNCTION public.purge_rods_day(_day_id uuid, _reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_day public.rods_days;
  v_claim_role text;
  v_allowed boolean;
BEGIN
  BEGIN
    v_claim_role := current_setting('request.jwt.claims', true)::json ->> 'role';
  EXCEPTION WHEN others THEN
    v_claim_role := NULL;
  END;

  -- coalesce is load-bearing. Written as `NOT (v_claim_role = 'service_role'
  -- OR session_user IN (...))`, a NULL claim made the whole predicate NULL,
  -- the IF never fired, and the gate failed OPEN for every caller holding
  -- EXECUTE. The check must be positive: refuse unless the caller is proven
  -- to be the service role.
  v_allowed := coalesce(v_claim_role = 'service_role', false)
            OR coalesce(session_user IN ('postgres', 'supabase_admin', 'service_role'), false);

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'purge_rods_day may only be called by the service role.'
      USING ERRCODE = '42501';
  END IF;

  IF coalesce(btrim(_reason), '') = '' OR length(btrim(_reason)) < 12 THEN
    RAISE EXCEPTION 'A written reason of at least 12 characters is required to purge a record of duty status.';
  END IF;

  SELECT * INTO v_day FROM public.rods_days WHERE id = _day_id FOR UPDATE;
  IF v_day.id IS NULL THEN
    RAISE EXCEPTION 'Log not found.';
  END IF;

  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (
    auth.uid(),
    coalesce(v_claim_role, session_user),
    'rods_day_purged',
    'rods_day',
    v_day.id,
    coalesce(v_day.log_date::text, '(no date)'),
    jsonb_build_object(
      'reason', btrim(_reason),
      'operator_id', v_day.operator_id,
      'log_date', v_day.log_date,
      'status', v_day.status,
      'certified_at', v_day.certified_at,
      'record_source', v_day.record_source,
      'supersedes_day_id', v_day.supersedes_day_id,
      'locked', v_day.locked,
      'cfr_note', '49 CFR 395.8(k)(1) requires six months retention'
    )
  );

  PERFORM set_config('rods.purge', 'on', true);
  PERFORM set_config('rods.privileged', 'on', true);

  DELETE FROM public.rods_events WHERE rods_day_id = _day_id;
  DELETE FROM public.rods_amendments WHERE rods_day_id = _day_id;
  DELETE FROM public.rods_days WHERE id = _day_id;
END;
$function$;