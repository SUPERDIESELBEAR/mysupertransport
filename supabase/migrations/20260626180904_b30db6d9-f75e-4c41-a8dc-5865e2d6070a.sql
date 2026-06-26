CREATE OR REPLACE FUNCTION public.enforce_onboarding_status_operator_column_whitelist()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  v_old := to_jsonb(OLD);
  v_new := to_jsonb(NEW);

  FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
    IF v_new->v_key IS DISTINCT FROM v_old->v_key THEN
      IF v_key = ANY(v_allowed) THEN
        CONTINUE;
      END IF;

      -- Drivers/truck owners may only move ICA status forward to complete.
      -- This supports the signing/acknowledgment flow while preventing edits to
      -- every other onboarding field and preventing regressions from complete.
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
$$;

CREATE OR REPLACE FUNCTION public.sync_ica_completion_to_onboarding()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.operator_id IS NOT NULL
     AND (NEW.status = 'fully_executed' OR NEW.contractor_signed_at IS NOT NULL) THEN
    UPDATE public.onboarding_status
    SET
      ica_status = 'complete',
      updated_at = now()
    WHERE operator_id = NEW.operator_id
      AND COALESCE(ica_status::text, '') <> 'complete';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_ica_completion_to_onboarding ON public.ica_contracts;
CREATE TRIGGER trg_sync_ica_completion_to_onboarding
  AFTER INSERT OR UPDATE OF status, contractor_signed_at
  ON public.ica_contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_ica_completion_to_onboarding();