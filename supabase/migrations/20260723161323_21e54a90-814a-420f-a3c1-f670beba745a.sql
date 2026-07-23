CREATE OR REPLACE FUNCTION public.enforce_eld_signature_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.equipment_asset_sheet_reset', true) = '1' THEN
    RETURN NEW;
  END IF;

  IF OLD.eld_signature_signed_at IS NOT NULL THEN
    NEW.eld_signature_typed_name := OLD.eld_signature_typed_name;
    NEW.eld_signature_image_url  := OLD.eld_signature_image_url;
    NEW.eld_signature_signed_at  := OLD.eld_signature_signed_at;
    RETURN NEW;
  END IF;

  NEW.eld_signature_signed_at := OLD.eld_signature_signed_at;
  IF NEW.eld_signature_typed_name IS NOT NULL
     AND btrim(NEW.eld_signature_typed_name) <> ''
     AND NEW.eld_signature_image_url IS NOT NULL
     AND btrim(NEW.eld_signature_image_url) <> ''
     AND NEW.eld_signature_signed_at IS NULL THEN
    NEW.eld_signature_signed_at := now();
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_eld_signature_lock() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_eld_signature_lock() TO service_role;