
-- Fix the Vehicle Hub <-> Inspection Binder circular sync for Periodic DOT Inspections.
-- Vehicle Hub is the single source of truth: the binder mirrors the Vehicle Hub
-- inspection_date, and binder edits no longer flow back to the Vehicle Hub.

-- 1. Forward sync (Vehicle Hub -> Binder): copy inspection_date, not next_due_date.
CREATE OR REPLACE FUNCTION public.sync_dot_to_inspection_documents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id      uuid;
  v_existing_id  uuid;
  v_latest_date  date;
  v_file_path    text;
BEGIN
  -- Skip if this insert/update was caused by the reverse sync trigger
  IF current_setting('app.skip_dot_sync', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- Resolve the operator's auth user_id (binder rows are keyed by driver_id = user_id)
  SELECT user_id INTO v_user_id
  FROM public.operators
  WHERE id = NEW.operator_id;

  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  -- Only sync if THIS record is the latest inspection for the operator
  SELECT MAX(inspection_date) INTO v_latest_date
  FROM public.truck_dot_inspections
  WHERE operator_id = NEW.operator_id;

  IF NEW.inspection_date < COALESCE(v_latest_date, NEW.inspection_date) THEN
    RETURN NEW;
  END IF;

  v_file_path := CASE
    WHEN NEW.certificate_file_path IS NULL THEN NULL
    ELSE 'fleet-documents/' || NEW.certificate_file_path
  END;

  SELECT id INTO v_existing_id
  FROM public.inspection_documents
  WHERE driver_id = v_user_id
    AND name = 'Periodic DOT Inspections'
    AND scope = 'per_driver'
  ORDER BY uploaded_at DESC
  LIMIT 1;

  PERFORM set_config('app.skip_doc_sync', 'on', true);

  IF v_existing_id IS NULL THEN
    INSERT INTO public.inspection_documents (
      name, scope, driver_id, file_url, file_path, expires_at, uploaded_by
    ) VALUES (
      'Periodic DOT Inspections', 'per_driver', v_user_id,
      NEW.certificate_file_url, v_file_path, NEW.inspection_date, NEW.created_by
    );
  ELSE
    UPDATE public.inspection_documents
    SET file_url    = COALESCE(NEW.certificate_file_url, file_url),
        file_path   = COALESCE(v_file_path, file_path),
        expires_at  = NEW.inspection_date,
        updated_at  = now(),
        uploaded_by = COALESCE(NEW.created_by, uploaded_by)
    WHERE id = v_existing_id;
  END IF;

  PERFORM set_config('app.skip_doc_sync', 'off', true);

  RETURN NEW;
END;
$function$;

-- 2. Reverse sync (Binder -> Vehicle Hub): suppress when the forward sync is running.
CREATE OR REPLACE FUNCTION public.sync_dot_binder_to_vh()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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

  IF current_setting('app.skip_doc_sync', true) = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_operator_id
  FROM public.operators
  WHERE user_id = NEW.driver_id
  LIMIT 1;
  IF v_operator_id IS NULL THEN RETURN NEW; END IF;

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
$function$;
