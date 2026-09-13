-- TEMPORARY, REVERTED IN THE VERY NEXT MIGRATION. Widened only to prove that
-- src/test/return-sheet-device-enum.test.ts genuinely names an inventory device
-- type that osas_device_type cannot store. Four guards in this project have
-- shipped green while asserting nothing; this one is demonstrated red instead.
ALTER TABLE public.equipment_items DROP CONSTRAINT equipment_items_device_type_check;
ALTER TABLE public.equipment_items ADD CONSTRAINT equipment_items_device_type_check
  CHECK (device_type = ANY (ARRAY['eld'::text, 'dash_cam'::text, 'bestpass'::text, 'fuel_card'::text, 'toll_transponder'::text]));