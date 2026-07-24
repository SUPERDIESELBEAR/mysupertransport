
DO $$
DECLARE
  rec RECORD;
  normalized_serial TEXT;
  existing_item_id UUID;
  existing_assignment_id UUID;
  field_name TEXT;
  serial_value TEXT;
BEGIN
  FOR rec IN
    SELECT os.id AS onboarding_id, os.operator_id,
           os.eld_serial_number, os.dash_cam_number, os.bestpass_number, os.fuel_card_number
    FROM public.onboarding_status os
    WHERE os.operator_id IS NOT NULL
  LOOP
    FOR field_name, serial_value IN VALUES
      ('eld', rec.eld_serial_number),
      ('dash_cam', rec.dash_cam_number),
      ('bestpass', rec.bestpass_number),
      ('fuel_card', rec.fuel_card_number)
    LOOP
      CONTINUE WHEN serial_value IS NULL OR btrim(serial_value) = '';

      normalized_serial := upper(regexp_replace(btrim(serial_value), '[-.\s]', '', 'g'));
      CONTINUE WHEN normalized_serial = '';

      -- Find or create equipment item
      SELECT id INTO existing_item_id
      FROM public.equipment_items
      WHERE device_type = field_name
        AND serial_number = normalized_serial
      LIMIT 1;

      IF existing_item_id IS NULL THEN
        INSERT INTO public.equipment_items (serial_number, device_type, status)
        VALUES (normalized_serial, field_name, 'assigned')
        RETURNING id INTO existing_item_id;
      END IF;

      -- Find or create active assignment for this operator + device
      SELECT id INTO existing_assignment_id
      FROM public.equipment_assignments
      WHERE operator_id = rec.operator_id
        AND equipment_id = existing_item_id
        AND returned_at IS NULL
      LIMIT 1;

      IF existing_assignment_id IS NULL THEN
        -- Ensure no other active assignment for this item exists; if so, return it first
        UPDATE public.equipment_assignments
        SET returned_at = now()
        WHERE equipment_id = existing_item_id
          AND returned_at IS NULL
          AND operator_id != rec.operator_id;

        INSERT INTO public.equipment_assignments (equipment_id, operator_id, assigned_by)
        VALUES (existing_item_id, rec.operator_id, NULL);
      END IF;

    END LOOP;
  END LOOP;
END $$;
