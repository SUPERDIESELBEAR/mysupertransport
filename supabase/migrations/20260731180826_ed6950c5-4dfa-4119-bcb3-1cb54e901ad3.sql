-- Three-arg form: the caller must declare who removes the row's storage objects.
CREATE OR REPLACE FUNCTION public.purge_rods_day(_day_id uuid, _reason text, _storage_owner text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_day public.rods_days;
  v_claim_role text;
  v_allowed boolean;
  v_audit_id uuid;
  v_paths text[] := '{}';
  v_disposition text;
BEGIN
  BEGIN
    v_claim_role := current_setting('request.jwt.claims', true)::json ->> 'role';
  EXCEPTION WHEN others THEN
    v_claim_role := NULL;
  END;

  -- Positive form. A NULL claim must not make the predicate NULL and fail open.
  v_allowed := coalesce(v_claim_role = 'service_role', false)
            OR coalesce(session_user IN ('postgres', 'supabase_admin', 'service_role'), false);

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'purge_rods_day may only be called by the service role.'
      USING ERRCODE = '42501';
  END IF;

  -- Deliberateness gate. storage.protect_delete() means this function cannot
  -- remove the row's objects itself, so the caller must name itself as the
  -- party that will. Checked positively for the same fail-open reason.
  IF NOT coalesce(btrim(_storage_owner), '') <> '' THEN
    RAISE EXCEPTION 'purge_rods_day requires a declared storage owner; invoke it through the purge-rods-day edge function, which removes the row''s objects.'
      USING ERRCODE = '42501';
  END IF;

  IF coalesce(btrim(_reason), '') = '' OR length(btrim(_reason)) < 12 THEN
    RAISE EXCEPTION 'A written reason of at least 12 characters is required to purge a record of duty status.';
  END IF;

  SELECT * INTO v_day FROM public.rods_days WHERE id = _day_id FOR UPDATE;
  IF v_day.id IS NULL THEN
    RAISE EXCEPTION 'Log not found.';
  END IF;

  -- Only what this row owns. Never a prefix: an amendment and its original
  -- share a <operator_id>/<log_date>/ folder.
  IF coalesce(btrim(v_day.pdf_path), '') <> '' THEN
    v_paths := v_paths || v_day.pdf_path;
  END IF;
  IF coalesce(btrim(v_day.certification_signature_path), '') <> '' THEN
    v_paths := v_paths || v_day.certification_signature_path;
  END IF;
  IF coalesce(btrim(v_day.source_document_path), '') <> '' THEN
    v_paths := v_paths || v_day.source_document_path;
  END IF;

  v_disposition := CASE WHEN array_length(v_paths, 1) IS NULL
                        THEN 'not_applicable' ELSE 'pending_caller' END;

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
      'storage_paths', to_jsonb(v_paths),
      'storage_owner', btrim(_storage_owner),
      'storage_disposition', v_disposition,
      'cfr_note', '49 CFR 395.8(k)(1) requires six months retention'
    )
  )
  RETURNING id INTO v_audit_id;

  PERFORM set_config('rods.purge', 'on', true);
  PERFORM set_config('rods.privileged', 'on', true);

  DELETE FROM public.rods_events WHERE rods_day_id = _day_id;
  DELETE FROM public.rods_amendments WHERE rods_day_id = _day_id;
  DELETE FROM public.rods_days WHERE id = _day_id;

  RETURN jsonb_build_object(
    'day_id', _day_id,
    'audit_id', v_audit_id,
    'storage_paths', to_jsonb(v_paths),
    'storage_disposition', v_disposition
  );
END;
$function$;

-- Two-arg form kept only so the deploy window has a resolvable signature.
-- It always refuses; see docs/deferred-removals.md for the drop trigger.
CREATE OR REPLACE FUNCTION public.purge_rods_day(_day_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'purge_rods_day requires a declared storage owner; invoke it through the purge-rods-day edge function, which removes the row''s objects.'
    USING ERRCODE = '42501';
END;
$function$;

-- Disposition transitions on the storage result.
CREATE OR REPLACE FUNCTION public.record_rods_purge_storage_result(_audit_id uuid, _removed text[], _failed jsonb DEFAULT '[]'::jsonb, _late boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_claim_role text;
  v_disposition text;
BEGIN
  BEGIN
    v_claim_role := current_setting('request.jwt.claims', true)::json ->> 'role';
  EXCEPTION WHEN others THEN
    v_claim_role := NULL;
  END;

  IF NOT (coalesce(v_claim_role = 'service_role', false)
          OR coalesce(session_user IN ('postgres', 'supabase_admin', 'service_role'), false)) THEN
    RAISE EXCEPTION 'record_rods_purge_storage_result may only be called by the service role.'
      USING ERRCODE = '42501';
  END IF;

  v_disposition := CASE
    WHEN coalesce(jsonb_array_length(coalesce(_failed, '[]'::jsonb)), 0) > 0 THEN 'completed_with_failures'
    WHEN coalesce(_late, false) THEN 'completed_late'
    ELSE 'completed'
  END;

  UPDATE public.audit_log
     SET metadata = metadata
                 || jsonb_build_object(
                      'storage_removed', to_jsonb(coalesce(_removed, '{}'::text[])),
                      'storage_failed', coalesce(_failed, '[]'::jsonb),
                      'storage_disposition', v_disposition
                    )
   WHERE id = _audit_id
     AND action = 'rods_day_purged';
END;
$function$;