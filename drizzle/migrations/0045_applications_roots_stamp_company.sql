-- Demo carrier, stage 3, pass 3b: the two roots of the applications family stamp
-- their carrier at INSERT time, so no writer relies on the 3a backfill.
--
-- Shape, deliberately different from stamp_tenant_company_id in ONE way: an
-- anonymous applicant is a legitimate writer here (/apply runs with no session),
-- so an unresolvable caller is NOT refused outright while exactly one carrier
-- exists -- it resolves the sole carrier, the stage 2 pattern, and REFUSES as
-- soon as a second carrier exists. Pass 3d replaces that fallback with the
-- per-carrier apply link.
CREATE OR REPLACE FUNCTION public.stamp_application_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_resolved uuid := public.current_company_id();
  v_count    integer;
  v_sole     uuid;
BEGIN
  -- 1. A signed-in caller who resolves to a carrier gets THAT carrier.
  --    A supplied carrier that disagrees is REFUSED, not overwritten: unlike the
  --    nine child tables (where the parent is authoritative and the caller cannot
  --    know better), a staff caller naming another carrier here is a bug or an
  --    attempt, and silently rewriting it would hide both.
  IF v_resolved IS NOT NULL THEN
    IF NEW.company_id IS NOT NULL AND NEW.company_id <> v_resolved THEN
      RAISE EXCEPTION
        'Refusing to file a %.% row under carrier % while the caller belongs to carrier %.',
        TG_TABLE_SCHEMA, TG_TABLE_NAME, NEW.company_id, v_resolved
        USING ERRCODE = '42501',
              HINT = 'Omit company_id and it is taken from your own carrier.';
    END IF;
    NEW.company_id := v_resolved;
    RETURN NEW;
  END IF;

  -- 2. A service-role writer names the carrier explicitly and is trusted.
  IF auth.role() = 'service_role' AND NEW.company_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 3. Anonymous (or otherwise unresolvable) writer: the sole carrier while there
  --    is exactly one. Anything the caller supplied is ignored -- an anonymous
  --    caller does not get to choose a carrier.
  SELECT count(*), (array_agg(c.id))[1] INTO v_count, v_sole
  FROM (SELECT id FROM public.carrier_profile ORDER BY id) c;

  IF v_count = 1 THEN
    NEW.company_id := v_sole;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Cannot decide which carrier this %.% row belongs to: % carriers exist and the caller resolves to none.',
    TG_TABLE_SCHEMA, TG_TABLE_NAME, v_count
    USING ERRCODE = '42501',
          HINT = 'Use the carrier-specific apply link, or sign in as staff of the carrier.';
END;
$function$;

REVOKE ALL ON FUNCTION public.stamp_application_company() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stamp_application_company() FROM anon;
REVOKE ALL ON FUNCTION public.stamp_application_company() FROM authenticated;

DROP TRIGGER IF EXISTS stamp_company_id ON public.applications;
CREATE TRIGGER stamp_company_id
  BEFORE INSERT ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.stamp_application_company();

DROP TRIGGER IF EXISTS stamp_company_id ON public.application_invites;
CREATE TRIGGER stamp_company_id
  BEFORE INSERT ON public.application_invites
  FOR EACH ROW EXECUTE FUNCTION public.stamp_application_company();