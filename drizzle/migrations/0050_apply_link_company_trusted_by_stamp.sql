-- The apply link resolves its carrier SERVER-SIDE inside save_application_draft
-- (a definer function), but the stamp trigger could not tell that carrier apart
-- from one a browser had typed into the payload, so it discarded it and fell back
-- to "the sole carrier, or refuse". With a second carrier alive that refused every
-- application arriving through a perfectly good link.
--
-- The definer function now announces the carrier it resolved in a TRANSACTION-LOCAL
-- setting, and the trigger trusts the supplied carrier only when it matches that
-- announcement. A browser cannot set it: the RPC is the only thing that writes it,
-- it is cleared immediately after the write, and it never survives the transaction.

CREATE OR REPLACE FUNCTION public.stamp_application_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_resolved uuid := public.current_company_id();
  v_declared text := nullif(current_setting('app.apply_link_company', true), '');
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

  -- 3. The carrier came from a per-carrier apply link, resolved server-side from
  --    its slug by this transaction. Trusted only on an exact match.
  IF v_declared IS NOT NULL AND NEW.company_id IS NOT NULL
     AND NEW.company_id = v_declared::uuid THEN
    RETURN NEW;
  END IF;

  -- 4. Anonymous (or otherwise unresolvable) writer with no link: the sole carrier
  --    while there is exactly one. Anything the caller supplied is ignored -- an
  --    anonymous caller does not get to choose a carrier.
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

REVOKE EXECUTE ON FUNCTION public.stamp_application_company() FROM PUBLIC, anon, authenticated;