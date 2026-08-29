CREATE OR REPLACE FUNCTION public.enforce_equipment_serial_uniqueness()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  conflicting_serial text;
BEGIN
  -- Retiring a row is the REMEDY for a duplicate. The collision query already
  -- excludes deactivated rows as comparison targets; excluding them as the
  -- subject too means the guard can never block its own cleanup.
  IF NEW.status = 'deactivated' THEN
    RETURN NEW;
  END IF;

  -- Assign / return / archive are status transitions that never touch the
  -- serial. The trigger fires on them only because `status` is in its UPDATE
  -- column list, so exit before the collision query when nothing that can
  -- collide has changed. INSERT has no OLD and always falls through.
  IF TG_OP = 'UPDATE'
     AND OLD.device_type = NEW.device_type
     AND public.canonical_equipment_serial(OLD.serial_number)
         = public.canonical_equipment_serial(NEW.serial_number)
  THEN
    RETURN NEW;
  END IF;

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
REVOKE ALL ON FUNCTION public.enforce_equipment_serial_uniqueness() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_equipment_serial_uniqueness() FROM authenticated;

-- The planned unique canonical index never landed: what exists is NON-unique
-- and enforces nothing. Replace it with the partial unique index. Partial
-- because a total one would forbid multiple retired twins, which is exactly
-- the state a duplicate cleanup produces.
DROP INDEX IF EXISTS public.idx_equipment_items_canonical_serial;

CREATE UNIQUE INDEX idx_equipment_items_canonical_serial_uniq
  ON public.equipment_items (device_type, public.canonical_equipment_serial(serial_number))
  WHERE status <> 'deactivated';