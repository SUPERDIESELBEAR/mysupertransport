-- A driver's home screen states what a load is expected to add to his
-- settlement. That figure has to come from the policy actually assigned to
-- him; with staff-only read on pay_policy_assignments the client silently
-- falls back to the company default and would quote a number that is not his.
--
-- Additive: one SELECT policy, scoped to the operator's own row. No existing
-- policy is altered. The pay_policies table is already readable to
-- authenticated users, so no new grant is needed there.

GRANT SELECT ON public.pay_policy_assignments TO authenticated;

CREATE POLICY pay_policy_assignments_operator_read_own
  ON public.pay_policy_assignments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.operators o
      WHERE o.id = pay_policy_assignments.operator_id
        AND o.user_id = auth.uid()
    )
  );
