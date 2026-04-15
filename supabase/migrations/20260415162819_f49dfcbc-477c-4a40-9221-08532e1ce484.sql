-- Normalize existing serial numbers
UPDATE public.equipment_items
SET serial_number = upper(replace(replace(replace(serial_number, '-', ''), '.', ''), ' ', ''))
WHERE serial_number <> upper(replace(replace(replace(serial_number, '-', ''), '.', ''), ' ', ''));

-- Recreate unique index with stripped form
DROP INDEX IF EXISTS idx_equipment_items_serial_type;
CREATE UNIQUE INDEX idx_equipment_items_serial_type
  ON public.equipment_items (
    upper(replace(replace(replace(serial_number, '-', ''), '.', ''), ' ', '')),
    device_type
  );