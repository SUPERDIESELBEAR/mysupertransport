-- REVERTS the temporary widening from the previous migration. The demonstration
-- is complete: src/test/return-sheet-device-enum.test.ts named 'toll_transponder'
-- on both live arms. Back to the four real device types.
ALTER TABLE public.equipment_items DROP CONSTRAINT equipment_items_device_type_check;
ALTER TABLE public.equipment_items ADD CONSTRAINT equipment_items_device_type_check
  CHECK (device_type = ANY (ARRAY['eld'::text, 'dash_cam'::text, 'bestpass'::text, 'fuel_card'::text]));