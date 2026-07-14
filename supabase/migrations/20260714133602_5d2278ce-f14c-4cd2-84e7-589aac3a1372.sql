
-- 1. Fix broken column reference in IRP → MO Plate sync trigger
CREATE OR REPLACE FUNCTION public.sync_irp_expiry_to_mo_plate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operator_id uuid;
  v_plate_id uuid;
BEGIN
  IF NEW.name <> 'IRP Registration (cab card)' THEN RETURN NEW; END IF;
  IF NEW.scope <> 'per_driver' THEN RETURN NEW; END IF;
  IF NEW.driver_id IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO v_operator_id FROM public.operators WHERE user_id = NEW.driver_id LIMIT 1;
  IF v_operator_id IS NULL THEN RETURN NEW; END IF;

  SELECT plate_id INTO v_plate_id
  FROM public.mo_plate_assignments
  WHERE operator_id = v_operator_id
    AND event_type = 'assignment'
    AND returned_at IS NULL
  ORDER BY assigned_at DESC
  LIMIT 1;
  IF v_plate_id IS NULL THEN RETURN NEW; END IF;

  UPDATE public.mo_plates
  SET expires_at = NEW.expires_at
  WHERE id = v_plate_id
    AND expires_at IS DISTINCT FROM NEW.expires_at;

  RETURN NEW;
END;
$$;

-- 2. New trigger: staff-edited Periodic DOT date syncs back to Vehicle Hub
CREATE OR REPLACE FUNCTION public.sync_dot_binder_to_vh()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operator_id uuid;
  v_latest_id uuid;
BEGIN
  IF NEW.name <> 'Periodic DOT Inspections' OR NEW.scope <> 'per_driver' THEN
    RETURN NEW;
  END IF;
  IF NEW.expires_at IS NOT DISTINCT FROM OLD.expires_at THEN RETURN NEW; END IF;
  IF NEW.expires_at IS NULL THEN RETURN NEW; END IF;
  IF NEW.driver_id IS NULL THEN RETURN NEW; END IF;

  IF current_setting('app.skip_dot_sync', true) = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_operator_id
  FROM public.operators
  WHERE user_id = NEW.driver_id
  LIMIT 1;
  IF v_operator_id IS NULL THEN RETURN NEW; END IF;

  -- Guard against re-entry into sync_inspection_doc_to_dot
  PERFORM set_config('app.skip_dot_sync', 'on', true);

  SELECT id INTO v_latest_id
  FROM public.truck_dot_inspections
  WHERE operator_id = v_operator_id
  ORDER BY inspection_date DESC, created_at DESC
  LIMIT 1;

  IF v_latest_id IS NOT NULL THEN
    UPDATE public.truck_dot_inspections
    SET inspection_date = NEW.expires_at
    WHERE id = v_latest_id
      AND inspection_date IS DISTINCT FROM NEW.expires_at;
  ELSE
    INSERT INTO public.truck_dot_inspections (
      operator_id, inspection_date, reminder_interval, result,
      certificate_file_url, certificate_file_path, created_by
    ) VALUES (
      v_operator_id,
      NEW.expires_at,
      COALESCE((SELECT default_dot_reminder_interval_days FROM public.fleet_settings ORDER BY updated_at DESC LIMIT 1), 360),
      'pass',
      NEW.file_url,
      NEW.file_path,
      NEW.uploaded_by
    );
  END IF;

  PERFORM set_config('app.skip_dot_sync', 'off', true);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_dot_binder_to_vh ON public.inspection_documents;
CREATE TRIGGER trg_sync_dot_binder_to_vh
AFTER UPDATE OF expires_at ON public.inspection_documents
FOR EACH ROW EXECUTE FUNCTION public.sync_dot_binder_to_vh();
