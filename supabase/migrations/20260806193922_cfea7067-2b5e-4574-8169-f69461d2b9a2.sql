ALTER TABLE public.inspection_documents
  ADD COLUMN IF NOT EXISTS inspection_date date,
  ADD COLUMN IF NOT EXISTS inspection_result text,
  ADD COLUMN IF NOT EXISTS inspector_name text;

ALTER TABLE public.inspection_documents
  DROP CONSTRAINT IF EXISTS inspection_documents_inspection_result_check;
ALTER TABLE public.inspection_documents
  ADD CONSTRAINT inspection_documents_inspection_result_check
  CHECK (inspection_result IS NULL OR inspection_result IN ('pass','fail'));

CREATE OR REPLACE FUNCTION public.sync_inspection_doc_to_dot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    certificate_file_url, certificate_file_path, certificate_file_name,
    inspector_name, created_by
  ) VALUES (
    v_operator_id,
    COALESCE(NEW.inspection_date, CURRENT_DATE),
    v_default_int,
    COALESCE(NEW.inspection_result, 'pass'),
    NEW.file_url,
    NEW.file_path,
    NULL,
    NEW.inspector_name,
    NEW.uploaded_by
  );

  PERFORM set_config('app.skip_dot_sync', 'off', true);

  RETURN NEW;
END;
$$;