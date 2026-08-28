-- Look-alike serial guard for equipment_items — REPO/DATABASE RECONCILIATION.
--
-- 20260828105444 created both functions with `SET search_path = public`. The
-- live catalog reads `public, extensions` on both, so the file and the database
-- disagree and definer-search-path.test.ts (which reads files) fails against a
-- state that is not live. This migration re-declares both functions exactly as
-- they exist in the database, so a fresh checkout rebuilds what is live and the
-- file-based guard reasons about the real pin.
--
-- Contents transcribed from pg_get_functiondef and pg_indexes on 2026-08-28.
-- Every statement is idempotent; applying it is a no-op against the current
-- database.
--
-- O/0, I/1, L/1 and S/5 are the characters people transpose when reading a
-- serial off a label. Two rows that differ only in those characters are the
-- same physical device, and the previous unique index (which folded only
-- '-', '.' and ' ') admitted both.


CREATE OR REPLACE FUNCTION public.canonical_equipment_serial(_serial text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT translate(
    upper(regexp_replace(coalesce(_serial, ''), '[-. ]', '', 'g')),
    'OILS',
    '0115'
  )
$function$;

REVOKE ALL ON FUNCTION public.canonical_equipment_serial(text) FROM PUBLIC;

CREATE INDEX IF NOT EXISTS idx_equipment_items_canonical_serial
  ON public.equipment_items (device_type, public.canonical_equipment_serial(serial_number));

-- The trigger, not a unique index, is what enforces the rule: a unique index on
-- the canonical form would reject the row with a bare 23505 and no way to name
-- the serial it collided with. Staff need to be told WHICH device is already on
-- file, otherwise the message is unactionable at the counter.
CREATE OR REPLACE FUNCTION public.enforce_equipment_serial_uniqueness()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  conflicting_serial text;
BEGIN
  SELECT ei.serial_number
    INTO conflicting_serial
    FROM public.equipment_items ei
   WHERE ei.id <> NEW.id
     AND ei.device_type = NEW.device_type
     AND ei.status <> 'deactivated'
     AND public.canonical_equipment_serial(ei.serial_number)
         = public.canonical_equipment_serial(NEW.serial_number)
   LIMIT 1;

  IF conflicting_serial IS NOT NULL THEN
    RAISE EXCEPTION
      'That device is already on file as % — only look-alike characters differ.',
      conflicting_serial
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_equipment_serial_uniqueness() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_equipment_serial_uniqueness ON public.equipment_items;
CREATE TRIGGER trg_equipment_serial_uniqueness
  BEFORE INSERT OR UPDATE OF serial_number, device_type, status
  ON public.equipment_items
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_equipment_serial_uniqueness();
