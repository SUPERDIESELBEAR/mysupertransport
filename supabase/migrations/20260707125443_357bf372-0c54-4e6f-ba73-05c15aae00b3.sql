CREATE OR REPLACE FUNCTION public.execute_equipment_asset_signature(
  p_operator_id uuid,
  p_typed_name text,
  p_signature_image_url text
)
RETURNS TABLE (
  operator_id uuid,
  eld_signature_typed_name text,
  eld_signature_image_url text,
  eld_signature_signed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_existing_signed_at timestamptz;
  v_typed_name text := btrim(coalesce(p_typed_name, ''));
  v_image_url text := btrim(coalesce(p_signature_image_url, ''));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to execute the equipment asset sheet.'
      USING ERRCODE = '42501';
  END IF;

  IF v_typed_name = '' THEN
    RAISE EXCEPTION 'Typed name is required.'
      USING ERRCODE = '22023';
  END IF;

  IF v_image_url = '' THEN
    RAISE EXCEPTION 'Signature image is required.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.operators o
    WHERE o.id = p_operator_id
      AND (
        o.user_id = v_uid
        OR public.is_staff(v_uid)
        OR public.is_truck_owner_for_operator(v_uid, p_operator_id)
      )
  ) THEN
    RAISE EXCEPTION 'You are not allowed to execute this equipment asset sheet.'
      USING ERRCODE = '42501';
  END IF;

  SELECT os.eld_signature_signed_at
    INTO v_existing_signed_at
  FROM public.onboarding_status os
  WHERE os.operator_id = p_operator_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Equipment asset sheet status was not found for this operator.'
      USING ERRCODE = 'P0002';
  END IF;

  -- Keep signatures immutable after first successful execution.
  IF v_existing_signed_at IS NOT NULL THEN
    RETURN QUERY
    SELECT os.operator_id,
           os.eld_signature_typed_name,
           os.eld_signature_image_url,
           os.eld_signature_signed_at
    FROM public.onboarding_status os
    WHERE os.operator_id = p_operator_id;
    RETURN;
  END IF;

  PERFORM set_config('app.equipment_asset_signature_execute', '1', true);

  UPDATE public.onboarding_status os
     SET eld_signature_typed_name = v_typed_name,
         eld_signature_image_url = v_image_url
   WHERE os.operator_id = p_operator_id
   RETURNING os.operator_id,
             os.eld_signature_typed_name,
             os.eld_signature_image_url,
             os.eld_signature_signed_at
      INTO operator_id,
           eld_signature_typed_name,
           eld_signature_image_url,
           eld_signature_signed_at;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.execute_equipment_asset_signature(uuid, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.execute_equipment_asset_signature(uuid, text, text) FROM anon;

CREATE OR REPLACE FUNCTION public.enforce_onboarding_status_operator_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
     OR current_setting('app.equipment_asset_signature_execute', true) = '1' THEN
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
$$;

CREATE OR REPLACE FUNCTION public.enforce_onboarding_status_operator_column_whitelist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
     OR current_setting('app.equipment_asset_signature_execute', true) = '1' THEN
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
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_onboarding_status_operator_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_onboarding_status_operator_column_whitelist() FROM PUBLIC, anon, authenticated;