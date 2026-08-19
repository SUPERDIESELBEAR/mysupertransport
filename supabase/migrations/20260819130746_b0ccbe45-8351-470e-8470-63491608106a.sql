CREATE OR REPLACE FUNCTION public.sync_claim_flag_resolution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resolved boolean;
BEGIN
  v_resolved := (NULLIF(btrim(COALESCE(NEW.resolution, '')), '') IS NOT NULL)
                OR NEW.flag_level = 'cleared'::claim_flag_level;

  IF v_resolved THEN
    NEW.is_active := false;
    IF NEW.resolved_at IS NULL THEN
      NEW.resolved_at := now();
    END IF;
    IF NEW.resolved_by IS NULL THEN
      NEW.resolved_by := auth.uid();
    END IF;
  ELSE
    -- resolution removed / flag re-opened: clear the resolution trail
    NEW.resolved_at := NULL;
    NEW.resolved_by := NULL;
    IF TG_OP = 'UPDATE' AND OLD.is_active = false THEN
      NEW.is_active := true;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_claim_flag_resolution() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_claim_flags_sync_resolution ON public.claim_flags;
CREATE TRIGGER trg_claim_flags_sync_resolution
BEFORE INSERT OR UPDATE ON public.claim_flags
FOR EACH ROW EXECUTE FUNCTION public.sync_claim_flag_resolution();