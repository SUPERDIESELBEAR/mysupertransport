CREATE OR REPLACE FUNCTION public.enforce_rods_day_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Sanctioned service-role path. Must precede EVERY branch. Purge's safety
    -- comes from purge_rods_day()'s caller check and its audit write, not
    -- from this trigger.
    IF current_setting('rods.purge', true) = 'on' THEN
      RETURN OLD;
    END IF;

    -- Correction DRAFT: route to the discard path. Restricted to uncertified
    -- rows -- a certified amendment also carries supersedes_day_id, and
    -- discard_rods_amendment() cannot remove it, so sending the caller there
    -- would be false guidance for a federal record.
    IF OLD.supersedes_day_id IS NOT NULL
       AND OLD.certified_at IS NULL
       AND OLD.status <> 'certified'
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