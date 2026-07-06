CREATE OR REPLACE FUNCTION public.enforce_onboarding_status_operator_update()
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
     OR current_setting('app.equipment_asset_sheet_migration', true) = '1' THEN
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
     OR current_setting('app.equipment_asset_sheet_migration', true) = '1' THEN
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