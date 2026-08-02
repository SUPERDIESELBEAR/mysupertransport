CREATE OR REPLACE FUNCTION public.enforce_rods_correction_request_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_privileged boolean := coalesce(current_setting('rods.privileged', true), 'off') = 'on';
  -- A purge deletes the log the request points at. Both day references are
  -- ON DELETE SET NULL, so the delete arrives here as an UPDATE. Nulling a
  -- pointer to a row that no longer exists is not an edit to the request.
  -- The exemption is exactly that: pointer -> NULL, nothing else.
  v_purging boolean := coalesce(current_setting('rods.purge', true), 'off') = 'on';
BEGIN
  IF NEW.id <> OLD.id
     OR NEW.operator_id <> OLD.operator_id
     OR NEW.log_date <> OLD.log_date
     OR (NEW.rods_day_id IS DISTINCT FROM OLD.rods_day_id
         AND NOT (v_purging AND NEW.rods_day_id IS NULL))
     OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
     OR NEW.requested_by_name IS DISTINCT FROM OLD.requested_by_name
     OR NEW.requested_at <> OLD.requested_at
     OR NEW.issue <> OLD.issue
     OR NEW.is_demo <> OLD.is_demo
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'A correction request is append-only; only the driver''s response may be recorded.'
      USING ERRCODE = 'P0100';
  END IF;

  -- The resolution pointer. NULL-out belongs to the purge alone; setting it to
  -- a real log belongs to certify_rods_day. Neither is a hand edit.
  IF NEW.resolved_by_day_id IS DISTINCT FROM OLD.resolved_by_day_id THEN
    IF NEW.resolved_by_day_id IS NULL THEN
      IF NOT v_purging THEN
        RAISE EXCEPTION 'A correction request is closed by the certified log, not by hand.'
          USING ERRCODE = 'P0101';
      END IF;
    ELSIF NOT v_privileged THEN
      RAISE EXCEPTION 'A correction request is closed by the certified log, not by hand.'
        USING ERRCODE = 'P0101';
    END IF;
  END IF;

  -- What the driver said, and when it was settled, are written once.
  IF OLD.driver_response IS NOT NULL
     AND NEW.driver_response IS DISTINCT FROM OLD.driver_response THEN
    RAISE EXCEPTION 'A correction request response is recorded once and cannot be revised.'
      USING ERRCODE = 'P0106';
  END IF;

  IF OLD.resolved_at IS NOT NULL
     AND NEW.resolved_at IS DISTINCT FROM OLD.resolved_at THEN
    RAISE EXCEPTION 'The time a correction request was resolved cannot be changed.'
      USING ERRCODE = 'P0107';
  END IF;

  IF NOT v_privileged AND NOT v_purging THEN
    IF NOT coalesce(public.is_own_rods_operator(OLD.operator_id), false) THEN
      RAISE EXCEPTION 'Only the driver may answer a correction request.' USING ERRCODE = 'P0102';
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status <> 'open' THEN
      RAISE EXCEPTION 'This correction request has already been resolved.' USING ERRCODE = 'P0103';
    END IF;
    IF NEW.status NOT IN ('actioned','declined') THEN
      RAISE EXCEPTION 'A correction request can only be actioned or declined.' USING ERRCODE = 'P0104';
    END IF;
    IF NEW.status = 'declined' AND coalesce(btrim(NEW.driver_response),'') = '' THEN
      RAISE EXCEPTION 'Declining a correction request requires a written response.' USING ERRCODE = 'P0105';
    END IF;
    NEW.resolved_at := coalesce(NEW.resolved_at, now());
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;