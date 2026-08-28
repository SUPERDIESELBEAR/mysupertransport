-- Database-level guard against confusable-character duplicate device serials.
--
-- The existing unique index only folds dashes/dots/spaces and case, so
-- 'AABL36UG024945' and 'AABL36UGO24945' both fit. Vendor serials here are a
-- letter prefix followed by digits, so folding O->0, I/L->1 and S->5 can never
-- collapse two genuinely different devices.
--
-- Implemented as a trigger rather than a unique index because a handful of
-- pre-existing twins are still awaiting staff review in the Onboard Systems
-- serial-conflict panel; the trigger blocks NEW collisions without failing on
-- rows that already exist.

CREATE OR REPLACE FUNCTION public.canonical_equipment_serial(_serial text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT translate(
    upper(regexp_replace(coalesce(_serial, ''), '[-. ]', '', 'g')),
    'OILS',
    '0115'
  )
$$;

CREATE OR REPLACE FUNCTION public.enforce_equipment_serial_uniqueness()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

DROP TRIGGER IF EXISTS trg_equipment_serial_uniqueness ON public.equipment_items;
CREATE TRIGGER trg_equipment_serial_uniqueness
BEFORE INSERT OR UPDATE OF serial_number, device_type, status
ON public.equipment_items
FOR EACH ROW
EXECUTE FUNCTION public.enforce_equipment_serial_uniqueness();

CREATE INDEX IF NOT EXISTS idx_equipment_items_canonical_serial
  ON public.equipment_items (device_type, public.canonical_equipment_serial(serial_number));