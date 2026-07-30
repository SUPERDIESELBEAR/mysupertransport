-- Fix: pgcrypto lives in schema `extensions`; a definer pinned to
-- `search_path = public` cannot see gen_random_bytes, so every call raised
-- "function gen_random_bytes(integer) does not exist" and no short link was
-- ever created (document_short_links has 0 rows).
CREATE OR REPLACE FUNCTION public.get_or_create_short_link(_share_token text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_code text;
  v_existing text;
  v_attempt int := 0;
BEGIN
  IF _share_token IS NULL OR length(_share_token) < 8 THEN
    RAISE EXCEPTION 'invalid share token';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT code INTO v_existing
  FROM public.document_short_links
  WHERE share_token = _share_token;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_code := lower(substring(encode(extensions.gen_random_bytes(8), 'hex') from 1 for 8));
    BEGIN
      INSERT INTO public.document_short_links (code, share_token, created_by)
      VALUES (v_code, _share_token, auth.uid());
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt > 5 THEN
        RAISE;
      END IF;
    END;
  END LOOP;
END;
$function$;

-- Self-verification: a table created after Migration 1 must not hand anon
-- any privilege. Fails the migration loudly if the default ACL regressed.
DO $$
DECLARE v_acl text;
BEGIN
  CREATE TABLE public._zz_default_acl_probe (id int);
  SELECT coalesce(string_agg(a.privilege_type, ','), '(none)')
    INTO v_acl
  FROM pg_class c
  CROSS JOIN LATERAL aclexplode(c.relacl) AS a
  WHERE c.oid = 'public._zz_default_acl_probe'::regclass
    AND a.grantee = 'anon'::regrole;
  DROP TABLE public._zz_default_acl_probe;
  IF v_acl IS NOT NULL AND v_acl <> '(none)' THEN
    RAISE EXCEPTION 'default privileges regressed: anon got % on a new table', v_acl;
  END IF;
  RAISE NOTICE 'default-acl probe OK: anon receives no privileges on new tables';
END $$;