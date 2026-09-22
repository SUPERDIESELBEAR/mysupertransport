-- Wrap has_permission() in a sub-SELECT on the pay-policy write policies so it
-- is evaluated once per statement instead of once per row (project convention,
-- enforced by src/test/permission-wrapper-guard.test.ts). Same rule, same
-- permission — only the evaluation shape changes.
--
-- UNDO: recreate each policy with a bare public.has_permission('pay_policy.change').

DROP POLICY IF EXISTS pay_policies_insert_permission ON public.pay_policies;
DROP POLICY IF EXISTS pay_policies_update_permission ON public.pay_policies;
DROP POLICY IF EXISTS pay_policies_delete_permission ON public.pay_policies;

CREATE POLICY pay_policies_insert_permission ON public.pay_policies
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_permission('pay_policy.change')));
CREATE POLICY pay_policies_update_permission ON public.pay_policies
  FOR UPDATE TO authenticated
  USING ((SELECT public.has_permission('pay_policy.change')))
  WITH CHECK ((SELECT public.has_permission('pay_policy.change')));
CREATE POLICY pay_policies_delete_permission ON public.pay_policies
  FOR DELETE TO authenticated
  USING ((SELECT public.has_permission('pay_policy.change')));

DROP POLICY IF EXISTS pay_policy_assignments_insert_permission ON public.pay_policy_assignments;
DROP POLICY IF EXISTS pay_policy_assignments_update_permission ON public.pay_policy_assignments;
DROP POLICY IF EXISTS pay_policy_assignments_delete_permission ON public.pay_policy_assignments;

CREATE POLICY pay_policy_assignments_insert_permission ON public.pay_policy_assignments
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_permission('pay_policy.change')));
CREATE POLICY pay_policy_assignments_update_permission ON public.pay_policy_assignments
  FOR UPDATE TO authenticated
  USING ((SELECT public.has_permission('pay_policy.change')))
  WITH CHECK ((SELECT public.has_permission('pay_policy.change')));
CREATE POLICY pay_policy_assignments_delete_permission ON public.pay_policy_assignments
  FOR DELETE TO authenticated
  USING ((SELECT public.has_permission('pay_policy.change')));