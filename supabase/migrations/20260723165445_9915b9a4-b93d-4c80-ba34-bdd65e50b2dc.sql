
CREATE OR REPLACE FUNCTION public.enforce_onboarding_status_operator_column_whitelist()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_old jsonb;
  v_new jsonb;
  v_key text;
  v_allowed text[] := ARRAY[
    'decal_photo_ds_url',
    'decal_photo_ps_url',
    'truck_photos',
    'eld_signature_typed_name',
    'eld_signature_image_url',
    'eld_signature_signed_at',
    'updated_at',
    'updated_by'
  ];
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_staff(v_uid) THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.ica_sync_cascade', true) = '1'
     OR current_setting('app.equipment_asset_sheet_migration', true) = '1'
     OR current_setting('app.equipment_asset_signature_execute', true) = '1'
     OR current_setting('app.storage_photo_sync', true) = '1' THEN
    RETURN NEW;
  END IF;

  v_old := to_jsonb(OLD);
  v_new := to_jsonb(NEW);

  FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
    IF v_new->v_key IS DISTINCT FROM v_old->v_key THEN
      IF v_key = ANY(v_allowed) THEN
        CONTINUE;
      END IF;

      IF v_key = 'ica_status'
         AND NEW.ica_status::text = 'complete'
         AND COALESCE(OLD.ica_status::text, '') <> 'complete' THEN
        CONTINUE;
      END IF;

      RAISE EXCEPTION 'Operators may only update their own decal photos, truck_photos, ica_status, and equipment asset sheet signature';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- Backfill decals
SET LOCAL "app.storage_photo_sync" = '1';

WITH latest_decal AS (
  SELECT
    split_part(name, '/', 1)::uuid AS operator_id,
    CASE
      WHEN split_part(split_part(name, '/', 3), '_', 1) = 'ds' THEN 'ds'
      WHEN split_part(split_part(name, '/', 3), '_', 1) = 'ps' THEN 'ps'
    END AS side,
    name,
    row_number() OVER (
      PARTITION BY split_part(name, '/', 1), split_part(split_part(name, '/', 3), '_', 1)
      ORDER BY created_at DESC NULLS LAST
    ) AS rn
  FROM storage.objects
  WHERE bucket_id = 'operator-documents'
    AND name ~ '^[0-9a-f-]+/decal_photos/(ds|ps)_'
)
UPDATE public.onboarding_status os
SET
  decal_photo_ds_url = COALESCE(os.decal_photo_ds_url, ds.name),
  decal_photo_ps_url = COALESCE(os.decal_photo_ps_url, ps.name)
FROM
  (SELECT operator_id, name FROM latest_decal WHERE side = 'ds' AND rn = 1) ds
  FULL OUTER JOIN
  (SELECT operator_id, name FROM latest_decal WHERE side = 'ps' AND rn = 1) ps
    USING (operator_id)
WHERE os.operator_id = COALESCE(ds.operator_id, ps.operator_id)
  AND (os.decal_photo_ds_url IS NULL OR os.decal_photo_ps_url IS NULL);

-- Backfill truck photos into operator_documents
INSERT INTO public.operator_documents (operator_id, document_type, file_url, file_name, uploaded_at)
SELECT
  split_part(o.name, '/', 1)::uuid,
  'truck_photos'::public.operator_doc_type,
  o.name,
  split_part(o.name, '/', 3),
  o.created_at
FROM storage.objects o
WHERE o.bucket_id = 'operator-documents'
  AND o.name ~ '^[0-9a-f-]+/truck_photos/'
  AND NOT EXISTS (
    SELECT 1
    FROM public.operator_documents d
    WHERE d.operator_id = split_part(o.name, '/', 1)::uuid
      AND d.document_type = 'truck_photos'
      AND (d.file_url = o.name OR d.file_url LIKE '%' || o.name)
  );

-- Forward sync trigger
CREATE OR REPLACE FUNCTION public.sync_photos_from_storage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_operator uuid;
  v_folder   text;
  v_filename text;
  v_prefix   text;
BEGIN
  IF NEW.bucket_id <> 'operator-documents' THEN
    RETURN NEW;
  END IF;

  IF NEW.name !~ '^[0-9a-f-]{36}/[^/]+/[^/]+$' THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_operator := split_part(NEW.name, '/', 1)::uuid;
  EXCEPTION WHEN others THEN
    RETURN NEW;
  END;

  v_folder   := split_part(NEW.name, '/', 2);
  v_filename := split_part(NEW.name, '/', 3);

  PERFORM set_config('app.storage_photo_sync', '1', true);

  IF v_folder = 'decal_photos' THEN
    v_prefix := split_part(v_filename, '_', 1);

    IF v_prefix = 'ds' THEN
      UPDATE public.onboarding_status
         SET decal_photo_ds_url = NEW.name
       WHERE operator_id = v_operator;
    ELSIF v_prefix = 'ps' THEN
      UPDATE public.onboarding_status
         SET decal_photo_ps_url = NEW.name
       WHERE operator_id = v_operator;
    ELSE
      UPDATE public.onboarding_status
         SET decal_photos = COALESCE(decal_photos, '[]'::jsonb) || jsonb_build_object(
               'url',   NEW.name,
               'label', 'Angle ' || (jsonb_array_length(COALESCE(decal_photos, '[]'::jsonb)) + 1)
             )
       WHERE operator_id = v_operator
         AND NOT (COALESCE(decal_photos, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('url', NEW.name)));
    END IF;

  ELSIF v_folder = 'truck_photos' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.operator_documents
       WHERE operator_id = v_operator
         AND document_type = 'truck_photos'
         AND (file_url = NEW.name OR file_url LIKE '%' || NEW.name)
    ) THEN
      INSERT INTO public.operator_documents (operator_id, document_type, file_url, file_name, uploaded_at)
      VALUES (v_operator, 'truck_photos'::public.operator_doc_type, NEW.name, v_filename, COALESCE(NEW.created_at, now()));
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'sync_photos_from_storage failed for %: %', NEW.name, SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_photos_from_storage ON storage.objects;
CREATE TRIGGER trg_sync_photos_from_storage
  AFTER INSERT ON storage.objects
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_photos_from_storage();
