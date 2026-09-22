-- Two fixes, both found by the suite in the 2026-09-22 12:30 pass.
--
-- FIX 1 — the harness re-grant must not be reachable by a client role.
--
-- 0032 granted EXECUTE on regrant_sandbox_parity_execute() to PUBLIC so the test
-- could heal its own privilege. Three standing guards refused it, correctly:
--   definer-live-catalog: "no NEW SECURITY DEFINER function is executable by
--     anon" and "... by authenticated" — a definer function runs as its owner,
--     so `authenticated` means the whole driver population;
--   function-reachability: "public.regrant_sandbox_parity_execute() is
--     EXECUTABLE by a client role but nothing calls it" — a test is not a caller.
-- Allowlisting any of the three was not an option: the reachability guard says
-- in its own message that allowlisting a finding is the class that has cost this
-- project the most. The grant is withdrawn instead.
--
-- That leaves the original problem: the harness connects as the bare role
-- `sandbox_exec`, the sandbox DROPS AND RECREATES that role, and a grant is
-- attached to a role OID, so 0004's and 0008's grants were lost. Checked for a
-- durable target and there is none — `select ... from pg_auth_members` shows both
-- sandbox roles belong to NO group, so there is no persistent group role to
-- grant to, and the recreated role inherits nothing. Default privileges do not
-- apply to roles that do not exist yet, and event triggers do not fire for
-- CREATE ROLE (a global object). Nothing inside the database observes the
-- recreation.
--
-- So the re-grant must be performed by a session that already has the privilege,
-- on a schedule: an HOURLY reconciliation backstop, the least frequent cadence
-- that still repairs the role before most test runs. 24 runs a day. The cost of
-- the cadence is that after a recreation the live parity test can be red for up
-- to an hour; that is a red test, never a data risk, and grant_parity_report()
-- is only ever needed at test time.
--
-- grant_parity_report() keeps its own ACL and is never granted to anon,
-- authenticated or PUBLIC — it reads every table's grants. Granting it to the
-- two sandbox roles exposes nothing: both have rolbypassrls = true and already
-- read every row of every table.
--
-- FIX 2 — the owner's pending-announcement notice must not be able to abort the
-- announcement.
--
-- notification-isolation caught it: "every notification insert outside try_notify
-- is isolated" listed public.notify_owner_on_pending_release_note() with 1 bare
-- insert (0031). This is the same defect the 2026-09-21 20:30 pass fixed for
-- notify_staff_on_release_note() and I reintroduced it in the next notifier: an
-- AFTER INSERT trigger doing a raw INSERT means one bad notification row (a
-- constraint, a null recipient) aborts the whole transaction, so the owner's
-- update would fail to save because telling him about it failed. Routed through
-- public.try_notify(...), which records a delivery failure and returns false
-- instead of raising.
--
-- UNDO:
--   SELECT cron.unschedule('regrant-sandbox-parity-execute');
--   GRANT EXECUTE ON FUNCTION public.regrant_sandbox_parity_execute() TO PUBLIC;
--   (and restore the 0031 body for notify_owner_on_pending_release_note)

REVOKE ALL ON FUNCTION public.regrant_sandbox_parity_execute() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.regrant_sandbox_parity_execute() FROM anon;
REVOKE ALL ON FUNCTION public.regrant_sandbox_parity_execute() FROM authenticated;

COMMENT ON FUNCTION public.regrant_sandbox_parity_execute() IS
  'Restores EXECUTE on grant_parity_report() to the sandbox harness roles after the sandbox recreates them, which drops their grants with the role OID. Called hourly by cron job regrant-sandbox-parity-execute; never executable by a client role. See migrations 0032 and 0033.';

SELECT cron.schedule(
  'regrant-sandbox-parity-execute',
  '0 * * * *',
  $$SELECT public.regrant_sandbox_parity_execute();$$
);

CREATE OR REPLACE FUNCTION public.notify_owner_on_pending_release_note()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_owner RECORD;
  v_body  text := left(COALESCE(NEW.body, ''), 300);
BEGIN
  FOR v_owner IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role = 'owner'
  LOOP
    IF COALESCE(
      (SELECT in_app_enabled FROM public.notification_preferences
       WHERE user_id = v_owner.user_id AND event_type = 'release_note_pending' LIMIT 1),
      TRUE
    ) THEN
      -- try_notify, never a bare INSERT: a failed notice must not abort the
      -- announcement that triggered it.
      PERFORM public.try_notify(
        v_owner.user_id,
        'release_note_pending',
        'New update ready to review — ' || NEW.title,
        v_body,
        '/dashboard?view=whats-new',
        NULL,
        'release_note',
        NEW.id,
        'in_app',
        NEW.title
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_owner_on_pending_release_note() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_owner_on_pending_release_note() FROM anon;
REVOKE ALL ON FUNCTION public.notify_owner_on_pending_release_note() FROM authenticated;