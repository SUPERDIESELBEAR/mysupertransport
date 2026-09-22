-- Security finding lov_db_rls_tautology_permissive_v1_1e1ea9fce0435653:
-- policy "permission_actions_read_authenticated" on public.permission_actions has
-- USING (true), so every signed-in user — the whole driver population — reads the
-- full catalogue of protected actions, including the money actions and which are
-- deliberately ungranted.
--
-- Not user data, but not a driver's business either: it is a map of what this
-- system protects and what it does not. Read is narrowed to staff.
--
-- Behaviour checked before changing it: NO application code reads
-- permission_actions. `rg permission_actions src supabase` finds only test files,
-- which connect as a BYPASSRLS sandbox role. has_permission() reads it as
-- SECURITY DEFINER, so the gate itself is unaffected. Drivers lose nothing.
--
-- UNDO:
--   DROP POLICY IF EXISTS permission_actions_read_staff ON public.permission_actions;
--   CREATE POLICY permission_actions_read_authenticated ON public.permission_actions
--     FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS permission_actions_read_authenticated ON public.permission_actions;

CREATE POLICY permission_actions_read_staff
ON public.permission_actions
FOR SELECT
TO authenticated
USING (
  (SELECT public.has_role(auth.uid(), 'owner'))
  OR (SELECT public.has_role(auth.uid(), 'management'))
  OR (SELECT public.has_role(auth.uid(), 'onboarding_staff'))
  OR (SELECT public.has_role(auth.uid(), 'dispatcher'))
);