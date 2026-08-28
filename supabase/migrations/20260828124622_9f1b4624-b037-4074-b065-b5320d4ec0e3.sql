CREATE OR REPLACE FUNCTION public.canonical_equipment_serial(_serial text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
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
SET search_path = public, extensions
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