-- Backfill truck_dot_inspections from existing inspection_documents (Periodic DOT Inspections)
-- Guard: prevent the sync_inspection_doc_to_dot trigger from firing during this backfill
SET LOCAL app.skip_dot_sync = 'on';

DO $$
DECLARE
  v_default_interval INT;
BEGIN
  SELECT COALESCE(default_dot_reminder_interval_days, 360)
    INTO v_default_interval
    FROM public.fleet_settings
    LIMIT 1;

  IF v_default_interval IS NULL THEN
    v_default_interval := 360;
  END IF;

  INSERT INTO public.truck_dot_inspections (
    operator_id,
    inspection_date,
    reminder_interval,
    result,
    certificate_file_url,
    certificate_file_path,
    certificate_file_name,
    created_by
  )
  SELECT
    o.id AS operator_id,
    COALESCE(
      (idoc.expires_at - (v_default_interval || ' days')::interval)::date,
      idoc.uploaded_at::date
    ) AS inspection_date,
    v_default_interval AS reminder_interval,
    'pass' AS result,
    idoc.file_url AS certificate_file_url,
    idoc.file_path AS certificate_file_path,
    CASE
      WHEN idoc.file_path IS NOT NULL
        THEN regexp_replace(idoc.file_path, '^.*/', '')
      ELSE NULL
    END AS certificate_file_name,
    idoc.uploaded_by AS created_by
  FROM public.inspection_documents idoc
  JOIN public.operators o ON o.user_id = idoc.driver_id
  WHERE idoc.name = 'Periodic DOT Inspections'
    AND idoc.scope = 'per_driver'
    AND NOT EXISTS (
      SELECT 1 FROM public.truck_dot_inspections tdi
      WHERE tdi.operator_id = o.id
    );
END $$;