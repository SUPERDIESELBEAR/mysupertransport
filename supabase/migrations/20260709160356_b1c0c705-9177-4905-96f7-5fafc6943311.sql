
ALTER TABLE public.equipment_items DROP CONSTRAINT equipment_items_status_check;
ALTER TABLE public.equipment_items ADD CONSTRAINT equipment_items_status_check
  CHECK (status = ANY (ARRAY['available'::text, 'assigned'::text, 'damaged'::text, 'lost'::text, 'deactivated'::text]));

ALTER TABLE public.equipment_assignments DROP CONSTRAINT equipment_assignments_return_condition_check;
ALTER TABLE public.equipment_assignments ADD CONSTRAINT equipment_assignments_return_condition_check
  CHECK (return_condition = ANY (ARRAY['available'::text, 'damaged'::text, 'lost'::text, 'deactivated'::text]));
