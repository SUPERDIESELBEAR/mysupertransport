-- Step 6 of the 2026-09-22 pay-policy-history pass: make grant_parity_report()
-- reachable by the test harness in a way that SURVIVES role recreation.
--
-- The defect, read live 2026-09-22 12:20 UTC: the harness psql session connects
-- as the bare role `sandbox_exec`. Migration 0004 granted EXECUTE to it, 0008
-- re-granted with a quoted identifier and it read true. It now reads FALSE
-- again, and the ACL on grant_parity_report() names only
--   postgres, service_role, sandbox_exec_qgxpkcudwjmacrdcyvhj
-- so the bare role was DROPPED AND RECREATED in between, taking its grant with
-- it. A one-shot GRANT in a migration can never hold: it is attached to a role
-- OID the sandbox replaces.
--
-- The fix is a re-grant the harness can perform ITSELF, at the moment it needs
-- it, with no polling and no weakening of either test:
--   * the re-grant is a SECURITY DEFINER function owned by postgres;
--   * it grants EXECUTE on grant_parity_report() ONLY to the literal sandbox
--     harness roles (`sandbox_exec` and `sandbox_exec_%`), never to anon,
--     authenticated, service_role or PUBLIC;
--   * EXECUTE on the re-grant function itself is public, which is safe because
--     calling it can grant nothing to the caller. An anon or authenticated
--     caller gains no privilege from it at all.
--
-- Why granting these roles anything is not an exposure: both sandbox roles have
-- rolbypassrls = true, so they already read every row of every table in this
-- database. A read-only report of who holds which grant adds nothing.
--
-- Why not an event trigger: event triggers do not fire for global objects, and
-- CREATE ROLE / DROP ROLE are global. There is no in-database hook on role
-- creation, so the choice was between the harness healing it on demand (this)
-- and a per-minute cron sweep (rejected: 1440 runs a day to serve a test).
--
-- grant_parity_report() itself keeps its ACL. This does NOT give it to any
-- client role, and it never may be given to one — it reads every table's grants.
--
-- UNDO:
--   DROP FUNCTION IF EXISTS public.regrant_sandbox_parity_execute();

CREATE OR REPLACE FUNCTION public.regrant_sandbox_parity_execute()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT rolname FROM pg_roles
     WHERE rolname = 'sandbox_exec'
        OR rolname LIKE 'sandbox\_exec\_%'
  LOOP
    IF NOT has_function_privilege(r.rolname, 'public.grant_parity_report()', 'EXECUTE') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.grant_parity_report() TO %I', r.rolname);
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END;
$$;

COMMENT ON FUNCTION public.regrant_sandbox_parity_execute() IS
  'Restores EXECUTE on grant_parity_report() to the sandbox harness roles after the sandbox recreates them. Called by src/test/grant-parity-live.test.ts before it reads the report. Grants nothing to its caller. See migration 0032.';

GRANT EXECUTE ON FUNCTION public.regrant_sandbox_parity_execute() TO PUBLIC;

SELECT public.regrant_sandbox_parity_execute();