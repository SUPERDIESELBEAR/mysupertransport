
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
BEGIN
  IF current_setting('app.skip_dot_sync', true) = 'on' THEN
    RETURN NEW;
  END IF;

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
      NEW.certificate_file_url, NEW.certificate_file_path, NEW.next_due_date, NEW.created_by
    );
  ELSE
    UPDATE public.inspection_documents
    SET file_url    = COALESCE(NEW.certificate_file_url, file_url),
        file_path   = COALESCE(NEW.certificate_file_path, file_path),
        expires_at  = NEW.next_due_date,
        updated_at  = now(),
        uploaded_by = COALESCE(NEW.created_by, uploaded_by)
    WHERE id = v_existing_id;
  END IF;

  PERFORM set_config('app.skip_doc_sync', 'off', true);

  RETURN NEW;
END;
$function$;

-- And simplify the reverse trigger to not strip a prefix
CREATE OR REPLACE FUNCTION public.sync_inspection_doc_to_dot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_operator_id  uuid;
  v_default_int  int;
BEGIN
  IF NEW.name <> 'Periodic DOT Inspections' OR NEW.scope <> 'per_driver' THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.skip_doc_sync', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.driver_id IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO v_operator_id
  FROM public.operators
  WHERE user_id = NEW.driver_id
  LIMIT 1;

  IF v_operator_id IS NULL THEN RETURN NEW; END IF;

  SELECT default_dot_reminder_interval_days INTO v_default_int
  FROM public.fleet_settings
  ORDER BY updated_at DESC
  LIMIT 1;

  v_default_int := COALESCE(v_default_int, 360);

  PERFORM set_config('app.skip_dot_sync', 'on', true);

  INSERT INTO public.truck_dot_inspections (
    operator_id, inspection_date, reminder_interval, result,
    certificate_file_url, certificate_file_path, certificate_file_name, created_by
  ) VALUES (
    v_operator_id,
    CURRENT_DATE,
    v_default_int,
    'pass',
    NEW.file_url,
    NEW.file_path,
    NULL,
    NEW.uploaded_by
  );

  PERFORM set_config('app.skip_dot_sync', 'off', true);

  RETURN NEW;
END;
$function$;
