-- Keep a driver's account record (profiles.phone / profiles.home_state) filled in
-- from their application. Fill-blanks-only: a value set by hand always wins.

CREATE OR REPLACE FUNCTION public.sync_profile_contact_from_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
  v_state text;
BEGIN
  IF NEW.user_id IS NULL OR NEW.application_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(a.phone, ''), NULLIF(a.address_state, '')
    INTO v_phone, v_state
  FROM public.applications a
  WHERE a.id = NEW.application_id;

  IF v_phone IS NULL AND v_state IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.profiles p
     SET phone      = COALESCE(NULLIF(p.phone, ''), v_phone),
         home_state = COALESCE(NULLIF(p.home_state, ''), v_state)
   WHERE p.user_id = NEW.user_id
     AND (NULLIF(p.phone, '') IS NULL OR NULLIF(p.home_state, '') IS NULL);

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_profile_contact_from_application() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_sync_profile_contact_from_application ON public.operators;

CREATE TRIGGER trg_sync_profile_contact_from_application
AFTER INSERT OR UPDATE OF user_id, application_id ON public.operators
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_contact_from_application();