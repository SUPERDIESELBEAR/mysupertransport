-- ============================================================================
-- RODS delete guard: re-key on the compliance fact, fix the discard deadlock,
-- and add the sanctioned audited purge path.
--
-- NOTE FOR FUTURE READERS: discard_rods_amendment() runs *through* this
-- trigger -- it does not bypass it via rods.privileged. Before this migration
-- the supersedes branch raised unconditionally, so discard_rods_amendment()
-- raised the message telling the caller to call discard_rods_amendment().
-- The amendment lifecycle could never complete. It now sets rods.discard.
--
-- All three gucs (rods.privileged, rods.discard, rods.purge) are
-- TRANSACTION-LOCAL by contract: every setter must pass is_local = true to
-- set_config. Session-scoped values would survive on a pooled connection and
-- could be observed by a later, unrelated request.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_rods_day_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Sanctioned service-role path. Must precede EVERY branch: a certified
    -- amendment has supersedes_day_id set and would otherwise be routed to
    -- discard_rods_amendment(), which only handles drafts. Purge's safety
    -- comes from purge_rods_day()'s caller check and its audit write, not
    -- from this trigger.
    IF current_setting('rods.purge', true) = 'on' THEN
      RETURN OLD;
    END IF;

    IF OLD.supersedes_day_id IS NOT NULL
       AND current_setting('rods.discard', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Use discard_rods_amendment() to remove a correction draft.';
    END IF;

    -- The compliance fact. Not clearable through the UPDATE branch's
    -- rods.privileged escape the way `locked` is.
    IF OLD.certified_at IS NOT NULL OR OLD.status = 'certified' THEN
      RAISE EXCEPTION 'This log is certified and is a federal record. It cannot be deleted.'
        USING ERRCODE = 'P0002';
    END IF;

    -- Locked but NOT certified. After the re-key this is near-unreachable; if
    -- it fires, a row is locked without being certified -- a state that should
    -- not exist. Distinct code so it is visible on its own.
    IF OLD.locked THEN
      RAISE EXCEPTION 'This log is locked and cannot be deleted.'
        USING ERRCODE = 'P0041';
    END IF;

    RETURN OLD;
  END IF;

  IF OLD.locked AND current_setting('rods.privileged', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'This log is certified and is a federal record. It cannot be changed.'
      USING ERRCODE = 'P0040';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Fix the discard deadlock.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.discard_rods_amendment(_day_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_day public.rods_days;
BEGIN
  SELECT * INTO v_day FROM public.rods_days WHERE id = _day_id FOR UPDATE;
  IF v_day.id IS NULL THEN RAISE EXCEPTION 'Log not found.'; END IF;
  IF NOT public.is_own_rods_operator(v_day.operator_id) THEN
    RAISE EXCEPTION 'Only the driver may discard their own correction.';
  END IF;
  IF v_day.status <> 'draft' OR v_day.supersedes_day_id IS NULL THEN
    RAISE EXCEPTION 'Only an uncertified correction draft can be discarded.';
  END IF;

  -- Transaction-local. Escapes ONLY the supersedes branch of
  -- enforce_rods_day_lock; a discard still cannot remove a certified row.
  PERFORM set_config('rods.discard', 'on', true);

  DELETE FROM public.rods_events WHERE rods_day_id = _day_id;
  DELETE FROM public.rods_days WHERE id = _day_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- The audited deletion path.
--
-- 49 CFR 395.8(k)(1) requires a motor carrier to retain records of duty status
-- for six months. Deleting one is therefore a deliberate, logged act -- never
-- an unlock-then-delete performed ad hoc.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_rods_day(_day_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_day public.rods_days;
BEGIN
  IF current_user <> 'service_role' THEN
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

  -- Audit BEFORE the delete, so the row exists even if the delete fails.
  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (
    auth.uid(),
    'service_role',
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

  -- Transaction-local. Short-circuits every DELETE branch of
  -- enforce_rods_day_lock / enforce_rods_event_lock.
  PERFORM set_config('rods.purge', 'on', true);
  PERFORM set_config('rods.privileged', 'on', true);

  DELETE FROM public.rods_events WHERE rods_day_id = _day_id;
  DELETE FROM public.rods_amendments WHERE rods_day_id = _day_id;
  DELETE FROM public.rods_days WHERE id = _day_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.purge_rods_day(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_rods_day(uuid, text) TO service_role;

COMMENT ON FUNCTION public.purge_rods_day(uuid, text) IS
  'Service-role-only audited deletion of a record of duty status. Writes an audit_log row before deleting. 49 CFR 395.8(k)(1): six months retention.';