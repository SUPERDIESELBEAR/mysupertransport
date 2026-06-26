
CREATE OR REPLACE FUNCTION public.sync_ica_completion_to_onboarding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.operator_id IS NOT NULL
     AND (NEW.status = 'fully_executed' OR NEW.contractor_signed_at IS NOT NULL) THEN
    -- Mark this UPDATE as an internal cascade so the operator enforcement
    -- triggers on onboarding_status skip their checks. Transaction-scoped
    -- (third arg = true) so it can never leak across sessions.
    PERFORM set_config('app.ica_sync_cascade', '1', true);

    UPDATE public.onboarding_status
    SET
      ica_status = 'complete',
      updated_at = now()
    WHERE operator_id = NEW.operator_id
      AND COALESCE(ica_status::text, '') <> 'complete';

    PERFORM set_config('app.ica_sync_cascade', '', true);
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_onboarding_status_operator_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Staff bypass: allow anything.
  IF public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Internal cascade from sync_ica_completion_to_onboarding: allow the
  -- single ica_status flip that the sync trigger performs. The flag is
  -- set transaction-locally inside that trigger only.
  IF current_setting('app.ica_sync_cascade', true) = '1' THEN
    RETURN NEW;
  END IF;

  -- For operators (non-staff), forbid any change to columns outside the
  -- allowlist. Operators may only set their own decal photos, mark truck
  -- photos as requested, and mark ICA as complete during signing.
  IF NEW.decal_photo_ds_url     IS DISTINCT FROM OLD.decal_photo_ds_url
     OR NEW.decal_photo_ps_url  IS DISTINCT FROM OLD.decal_photo_ps_url
     OR NEW.truck_photos        IS DISTINCT FROM OLD.truck_photos
     OR NEW.ica_status          IS DISTINCT FROM OLD.ica_status
     OR NEW.updated_at          IS DISTINCT FROM OLD.updated_at
     OR NEW.updated_by          IS DISTINCT FROM OLD.updated_by
  THEN
    IF to_jsonb(NEW)
       - 'decal_photo_ds_url' - 'decal_photo_ps_url' - 'truck_photos'
       - 'ica_status' - 'updated_at' - 'updated_by'
       IS DISTINCT FROM
       to_jsonb(OLD)
       - 'decal_photo_ds_url' - 'decal_photo_ps_url' - 'truck_photos'
       - 'ica_status' - 'updated_at' - 'updated_by'
    THEN
      RAISE EXCEPTION 'Operators may only update their own decal photos, truck_photos, and ica_status';
    END IF;
  ELSE
    IF to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
      RAISE EXCEPTION 'Operators may only update their own decal photos, truck_photos, and ica_status';
    END IF;
  END IF;

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
    'updated_at'
  ];
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_staff(v_uid) THEN
    RETURN NEW;
  END IF;

  -- Internal cascade from sync_ica_completion_to_onboarding.
  IF current_setting('app.ica_sync_cascade', true) = '1' THEN
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

      RAISE EXCEPTION 'operator cannot modify column %', v_key;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;
