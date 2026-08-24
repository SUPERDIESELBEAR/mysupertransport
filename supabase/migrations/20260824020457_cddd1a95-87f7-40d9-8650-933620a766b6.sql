CREATE OR REPLACE FUNCTION public.grant_parity_report()
RETURNS TABLE (table_name text, role_name text, command text, issue text, detail text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  r record;
  cmds text[];
  c text;
BEGIN
  FOR r IN
    SELECT c.oid, c.relname, p.polname, p.polcmd, p.polroles,
           coalesce(pg_get_expr(p.polqual, p.polrelid), '') ||
           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') AS body
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    WHERE coalesce(pg_get_expr(p.polqual, p.polrelid), '') !~* '^\s*false\s*$'
       OR coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') !~* '^\s*false\s*$'
  LOOP
    IF btrim(replace(lower(r.body), 'false', '')) = '' THEN CONTINUE; END IF;

    cmds := CASE r.polcmd
      WHEN 'r' THEN ARRAY['SELECT'] WHEN 'a' THEN ARRAY['INSERT']
      WHEN 'w' THEN ARRAY['UPDATE'] WHEN 'd' THEN ARRAY['DELETE']
      ELSE ARRAY['SELECT','INSERT','UPDATE','DELETE'] END;

    FOREACH c IN ARRAY cmds LOOP
      IF (0 = ANY(r.polroles) OR 'authenticated'::regrole::oid = ANY(r.polroles))
         AND NOT has_table_privilege('authenticated', r.oid, c) THEN
        table_name := r.relname; role_name := 'authenticated'; command := c;
        issue := 'policy_without_grant';
        detail := format('policy "%s" admits authenticated for %s but the role holds no %s grant', r.polname, c, c);
        RETURN NEXT;
      END IF;

      IF (0 = ANY(r.polroles) OR 'anon'::regrole::oid = ANY(r.polroles))
         AND r.body !~* '(auth\.uid|auth\.jwt|has_role|is_staff|current_profile_id|service_role)'
         AND NOT has_table_privilege('anon', r.oid, c) THEN
        table_name := r.relname; role_name := 'anon'; command := c;
        issue := 'anon_policy_without_grant';
        detail := format('policy "%s" is anon-reachable for %s but anon holds no %s grant', r.polname, c, c);
        RETURN NEXT;
      END IF;
    END LOOP;
  END LOOP;

  FOR r IN
    SELECT DISTINCT c.oid, c.relname
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  LOOP
    IF NOT has_table_privilege('service_role', r.oid, 'SELECT') THEN
      table_name := r.relname; role_name := 'service_role'; command := 'SELECT';
      issue := 'service_role_without_grant';
      detail := 'table carries policies but service_role holds no SELECT grant';
      RETURN NEXT;
    END IF;
  END LOOP;

  FOR r IN
    SELECT DISTINCT c.oid, c.relname
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    WHERE NOT c.relrowsecurity
  LOOP
    table_name := r.relname; role_name := '-'; command := '-';
    issue := 'policies_without_rls';
    detail := 'table has policies but row level security is disabled';
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_parity_report() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_parity_report() TO service_role;
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.grant_parity_report() TO sandbox_exec';
  END IF;
END
$do$;