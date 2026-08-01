-- =====================================================================
-- SECURITY DEFINER hardening: search_path pins + EXECUTE grant narrowing
-- =====================================================================
--
-- Pre-change state of record: docs/eld-mail-queue-acl-2026-08-01.md
-- (verbatim proacl, proconfig and pg_get_functiondef for all seven, captured
-- before this migration overwrote them. proacl carries no history.)
--
-- ---------------------------------------------------------------------
-- WHY THE GRANTS WERE WIDE, AND WHY THIS HAS HAPPENED BEFORE
-- ---------------------------------------------------------------------
-- The four mail-queue wrappers below were ALREADY narrowed once, in
-- 20260428151032_email_infra.sql (lines 193-205). On 2026-08-01 the live ACL
-- read anon=X | authenticated=X on all four, and no migration in
-- supabase_migrations.schema_migrations between those dates touches them.
--
-- The earlier revoke was INCOMPLETE, and that is the real cause. It issued
-- REVOKE ... FROM PUBLIC only. That clears the implicit default-PUBLIC execute
-- every new function receives; it does NOT touch explicit grants to named
-- roles. anon and authenticated held EXPLICIT X (the implicit PUBLIC entry was
-- absent from all four), so they were granted by something later -- most
-- likely a blanket GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon,
-- authenticated from provisioning, or a re-CREATE of the wrappers by managed
-- email infrastructure inheriting the schema default.
--
-- This migration therefore names PUBLIC, anon and authenticated EXPLICITLY.
-- Do not reduce it back to REVOKE ... FROM PUBLIC.
--
-- ---------------------------------------------------------------------
-- THE DATE COULD NOT BE ESTABLISHED. FOUR DEAD ENDS, ALL CHECKED 2026-08-01.
-- ---------------------------------------------------------------------
--   1. No migration row records the widening.
--   2. track_commit_timestamp is OFF, so pg_xact_commit_timestamp(xmin)
--      raises 55000. This was the only direct instrument.
--   3. Every pg_proc row in public shares one frozen xmin (6815093), so
--      transaction-id ordering carries no signal either.
--   4. track_functions is none; pg_stat_user_functions is empty.
-- Do not repeat these. They are all closed.
--
-- The underlying reason none of it was answerable: log_statement = ddl IS on,
-- so the widening statement WAS logged -- but Postgres/edge log retention is
-- roughly TEN MINUTES. Security-relevant DDL on this database is captured and
-- then discarded, which means no privilege change here is investigable after
-- the fact. That is a standing condition, not a detail of this incident.
--
-- ---------------------------------------------------------------------
-- IF YOU ARE READING THIS BECAUSE anon=X IS BACK
-- ---------------------------------------------------------------------
-- It has happened before. The migration is not at fault. Check whether managed
-- email infrastructure was re-provisioned, and whether a schema-wide
-- GRANT ... TO anon, authenticated ran. The standing guard is
-- src/test/definer-live-catalog.test.ts, which reads pg_proc rather than these
-- files -- a file-based check cannot see an out-of-band grant.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Mail-queue wrappers: pin search_path. Bodies byte-identical to the
--    pre-change pg_get_functiondef output. pgmq is named explicitly because
--    the extension lives in its own pgmq schema, not in extensions.
--
--    These were UNPINNED (proconfig NULL), so each inherited the caller's
--    search_path -- the classic SECURITY DEFINER escalation shape. Note that
--    enqueue_email and read_email_batch both call pgmq.create() on the
--    undefined_table path: unpinned owner-privileged DDL.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pgmq', 'extensions'
AS $fn$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
 RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pgmq', 'extensions'
AS $fn$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pgmq', 'extensions'
AS $fn$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pgmq', 'extensions'
AS $fn$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$fn$;


-- ---------------------------------------------------------------------
-- 2. Mail-queue wrappers: narrow EXECUTE.
--
--    PostgREST exposes public functions as RPC, so anon=X meant an
--    unauthenticated caller holding only the publishable key could create
--    queues, enqueue payloads, move messages to a DLQ, delete them, and --
--    via read_email_batch -- READ MESSAGE PAYLOADS out of a queue they name.
--    q_auth_emails payloads contain fully rendered email bodies including
--    live magic-link, password-recovery and invite URLs.
--
--    Callers verified before revoking: auth-email-hook,
--    send-transactional-email and process-email-queue, all edge functions
--    using the service-role key. Nothing in src/ calls these under the
--    publishable key, so this breaks no client path.
--
--    PUBLIC, anon and authenticated are all named. See header.
-- ---------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;

REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;


-- ---------------------------------------------------------------------
-- 3. RODS purge functions: repin from 'public' to 'public, extensions'.
--    Bodies byte-identical to the pre-change pg_get_functiondef output;
--    only the SET search_path line changes.
--
--    These are defended in-body by a positive-form service-role check that
--    raises 42501, which is why the PUBLIC/anon grants on them were not
--    exploitable. The grants are still wrong and are narrowed below.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.purge_rods_day(_day_id uuid, _reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $fn$
BEGIN
  RAISE EXCEPTION 'purge_rods_day requires a declared storage owner; invoke it through the purge-rods-day edge function, which removes the row''s objects.'
    USING ERRCODE = '42501';
END;
$fn$;

CREATE OR REPLACE FUNCTION public.purge_rods_day(_day_id uuid, _reason text, _storage_owner text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $fn$
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
$fn$;

CREATE OR REPLACE FUNCTION public.record_rods_purge_storage_result(_audit_id uuid, _removed text[], _failed jsonb DEFAULT '[]'::jsonb, _late boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $fn$
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
$fn$;


-- ---------------------------------------------------------------------
-- 4. RODS purge functions: narrow EXECUTE to service_role.
--    Called only by the purge-rods-day edge function under the service key.
-- ---------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.purge_rods_day(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.purge_rods_day(uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.purge_rods_day(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.purge_rods_day(uuid, text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.record_rods_purge_storage_result(uuid, text[], jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.record_rods_purge_storage_result(uuid, text[], jsonb, boolean) TO service_role;