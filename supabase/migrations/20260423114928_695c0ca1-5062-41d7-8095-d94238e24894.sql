
-- ───────────────────────────────────────────────────────────────────────────
-- 1. fleet_settings (single-row config)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fleet_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  default_dot_reminder_interval_days int NOT NULL DEFAULT 360
    CHECK (default_dot_reminder_interval_days IN (90, 180, 270, 360)),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.fleet_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view fleet settings"
  ON public.fleet_settings FOR SELECT
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Management can insert fleet settings"
  ON public.fleet_settings FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Management can update fleet settings"
  ON public.fleet_settings FOR UPDATE
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

-- Seed the single row
INSERT INTO public.fleet_settings (default_dot_reminder_interval_days)
SELECT 360
WHERE NOT EXISTS (SELECT 1 FROM public.fleet_settings);

-- Auto-update updated_at
CREATE TRIGGER trg_fleet_settings_updated_at
  BEFORE UPDATE ON public.fleet_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Trigger: Vehicle Hub DOT inspection → Binder "Periodic DOT Inspections"
-- ───────────────────────────────────────────────────────────────────────────
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
  -- (older edits should not overwrite the binder's "current" record)
  SELECT MAX(inspection_date) INTO v_latest_date
  FROM public.truck_dot_inspections
  WHERE operator_id = NEW.operator_id;

  IF NEW.inspection_date < COALESCE(v_latest_date, NEW.inspection_date) THEN
    RETURN NEW;
  END IF;

  -- Prefix the file_path with the bucket name so the binder UI can route it
  -- to the correct storage bucket (existing convention used by bucketForBinderDoc).
  v_file_path := CASE
    WHEN NEW.certificate_file_path IS NULL THEN NULL
    ELSE 'fleet-documents/' || NEW.certificate_file_path
  END;

  -- Look up existing per-driver binder row for this driver
  SELECT id INTO v_existing_id
  FROM public.inspection_documents
  WHERE driver_id = v_user_id
    AND name = 'Periodic DOT Inspections'
    AND scope = 'per_driver'
  ORDER BY uploaded_at DESC
  LIMIT 1;

  -- Set guard so the reverse trigger doesn't fire
  PERFORM set_config('app.skip_doc_sync', 'on', true);

  IF v_existing_id IS NULL THEN
    INSERT INTO public.inspection_documents (
      name, scope, driver_id, file_url, file_path, expires_at, uploaded_by
    ) VALUES (
      'Periodic DOT Inspections', 'per_driver', v_user_id,
      NEW.certificate_file_url, v_file_path, NEW.next_due_date, NEW.created_by
    );
  ELSE
    UPDATE public.inspection_documents
    SET file_url    = COALESCE(NEW.certificate_file_url, file_url),
        file_path   = COALESCE(v_file_path, file_path),
        expires_at  = NEW.next_due_date,
        updated_at  = now(),
        uploaded_by = COALESCE(NEW.created_by, uploaded_by)
    WHERE id = v_existing_id;
  END IF;

  PERFORM set_config('app.skip_doc_sync', 'off', true);

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_dot_to_inspection_documents ON public.truck_dot_inspections;
CREATE TRIGGER trg_sync_dot_to_inspection_documents
  AFTER INSERT OR UPDATE ON public.truck_dot_inspections
  FOR EACH ROW EXECUTE FUNCTION public.sync_dot_to_inspection_documents();

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Trigger: Binder "Periodic DOT Inspections" upload → Vehicle Hub record
-- ───────────────────────────────────────────────────────────────────────────
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
  -- Only act on Periodic DOT Inspections entries
  IF NEW.name <> 'Periodic DOT Inspections' OR NEW.scope <> 'per_driver' THEN
    RETURN NEW;
  END IF;

  -- Skip if this insert was caused by the forward sync trigger
  IF current_setting('app.skip_doc_sync', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.driver_id IS NULL THEN RETURN NEW; END IF;

  -- Resolve operator_id from the driver's auth user_id
  SELECT id INTO v_operator_id
  FROM public.operators
  WHERE user_id = NEW.driver_id
  LIMIT 1;

  IF v_operator_id IS NULL THEN RETURN NEW; END IF;

  -- Pull the fleet-wide default interval
  SELECT default_dot_reminder_interval_days INTO v_default_int
  FROM public.fleet_settings
  ORDER BY updated_at DESC
  LIMIT 1;

  v_default_int := COALESCE(v_default_int, 360);

  -- Set guard so the forward trigger doesn't fire
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
    -- Strip the bucket prefix if present so the path is bucket-relative
    CASE
      WHEN NEW.file_path LIKE 'fleet-documents/%' THEN substring(NEW.file_path from 17)
      ELSE NEW.file_path
    END,
    NULL,
    NEW.uploaded_by
  );

  PERFORM set_config('app.skip_dot_sync', 'off', true);

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_inspection_doc_to_dot ON public.inspection_documents;
CREATE TRIGGER trg_sync_inspection_doc_to_dot
  AFTER INSERT ON public.inspection_documents
  FOR EACH ROW EXECUTE FUNCTION public.sync_inspection_doc_to_dot();
