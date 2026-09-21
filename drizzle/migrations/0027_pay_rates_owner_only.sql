-- PAY RATES OWNER-ONLY — P26, P32 (revised), P35.
-- Owner decisions 2026-09-21:
--   * Pay policies and their assignments: change requires pay_policy.change,
--     which NO role holds (owner only, via the has_permission short-circuit).
--   * ica_contracts.linehaul_split_pct: staff edit it freely while the
--     agreement is still 'draft'; once it has been SENT or later it requires
--     driver_pay.change (owner only).
--     Live status values on ica_contracts.status (free text, default 'draft'):
--       draft | sent_to_operator | fully_executed | complete
--     "Sent or later" = every value other than 'draft'. Written closed-by-
--     default: anything that is not exactly 'draft' is locked.
--   * operators.pay_percentage: owner-only at ALL times (UPDATE only; INSERT
--     still carries the column default so driver creation is untouched).
--   * contractor_pay_setup is deliberately NOT touched: it holds no pay column.
--
-- Co-existence with 0023's guard on ica_contracts (aa_guard_ica_contract_terms):
--   0023 answers "is the caller staff?" and refuses a NON-staff (driver / truck
--   owner) change to the contract economics, including linehaul_split_pct.
--   This migration adds ab_guard_ica_linehaul_split, which answers a different
--   question — "may this caller change the percentage on an agreement that has
--   already gone out?" — and applies to STAFF too. Both are BEFORE UPDATE and
--   both return NEW unchanged; the 'aa_' / 'ab_' names make 0023 run first, so
--   a driver still gets 0023's signing message and staff get this one.
--
-- Service role (design (d)): both triggers pass when auth.uid() IS NULL, exactly
-- as 0023 does. No edge function writes linehaul_split_pct, pay_percentage,
-- pay_policies or pay_policy_assignments today (verified live); any future one
-- must call has_permission(<caller>, '<action>') itself, two-argument form.
--
-- UNDO (for the record, not run here):
--   DROP TRIGGER IF EXISTS ab_guard_ica_linehaul_split ON public.ica_contracts;
--   DROP TRIGGER IF EXISTS ab_guard_operator_pay_percentage ON public.operators;
--   DROP FUNCTION IF EXISTS public.guard_ica_linehaul_split();
--   DROP FUNCTION IF EXISTS public.guard_operator_pay_percentage();
--   DROP POLICY pay_policies_insert_permission ON public.pay_policies;
--   DROP POLICY pay_policies_update_permission ON public.pay_policies;
--   DROP POLICY pay_policies_delete_permission ON public.pay_policies;
--   DROP POLICY pay_policy_assignments_insert_permission ON public.pay_policy_assignments;
--   DROP POLICY pay_policy_assignments_update_permission ON public.pay_policy_assignments;
--   DROP POLICY pay_policy_assignments_delete_permission ON public.pay_policy_assignments;
--   CREATE POLICY pay_policies_insert_management ON public.pay_policies FOR INSERT TO authenticated
--     WITH CHECK (has_role(auth.uid(),'management') OR has_role(auth.uid(),'owner'));
--   CREATE POLICY pay_policies_update_management ON public.pay_policies FOR UPDATE TO authenticated
--     USING (has_role(auth.uid(),'management') OR has_role(auth.uid(),'owner'))
--     WITH CHECK (has_role(auth.uid(),'management') OR has_role(auth.uid(),'owner'));
--   CREATE POLICY pay_policies_delete_management ON public.pay_policies FOR DELETE TO authenticated
--     USING (has_role(auth.uid(),'management') OR has_role(auth.uid(),'owner'));
--   (and the three equivalents on pay_policy_assignments)
--   DELETE FROM public.permission_actions WHERE key IN ('pay_policy.change','driver_pay.change');

-- 1. THE TWO ACTIONS. Neither appears in seed_role_permissions, so no role can
--    ever hold them: only the owner short-circuit in has_permission passes.
INSERT INTO public.permission_actions (key, label, description, category, kind) VALUES
  ('pay_policy.change', 'Change pay policies',
   'Create, change or remove a pay policy or a driver''s pay-policy assignment.',
   'pay', 'change'),
  ('driver_pay.change', 'Change a driver''s contracted pay',
   'Change the linehaul split on an agreement that has been sent, or a driver''s pay percentage.',
   'pay', 'change')
ON CONFLICT (key) DO NOTHING;

-- 2. PAY POLICIES + ASSIGNMENTS — writes require pay_policy.change. Reads
--    unchanged (staff keep pay_policies_read_staff / ..._read_staff).
DROP POLICY IF EXISTS pay_policies_insert_management ON public.pay_policies;
DROP POLICY IF EXISTS pay_policies_update_management ON public.pay_policies;
DROP POLICY IF EXISTS pay_policies_delete_management ON public.pay_policies;

CREATE POLICY pay_policies_insert_permission ON public.pay_policies
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('pay_policy.change'));
CREATE POLICY pay_policies_update_permission ON public.pay_policies
  FOR UPDATE TO authenticated
  USING (public.has_permission('pay_policy.change'))
  WITH CHECK (public.has_permission('pay_policy.change'));
CREATE POLICY pay_policies_delete_permission ON public.pay_policies
  FOR DELETE TO authenticated
  USING (public.has_permission('pay_policy.change'));

DROP POLICY IF EXISTS pay_policy_assignments_insert_management ON public.pay_policy_assignments;
DROP POLICY IF EXISTS pay_policy_assignments_update_management ON public.pay_policy_assignments;
DROP POLICY IF EXISTS pay_policy_assignments_delete_management ON public.pay_policy_assignments;

CREATE POLICY pay_policy_assignments_insert_permission ON public.pay_policy_assignments
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('pay_policy.change'));
CREATE POLICY pay_policy_assignments_update_permission ON public.pay_policy_assignments
  FOR UPDATE TO authenticated
  USING (public.has_permission('pay_policy.change'))
  WITH CHECK (public.has_permission('pay_policy.change'));
CREATE POLICY pay_policy_assignments_delete_permission ON public.pay_policy_assignments
  FOR DELETE TO authenticated
  USING (public.has_permission('pay_policy.change'));

-- 3. THE AGREEMENT PERCENTAGE — locked once the agreement is sent or later.
CREATE OR REPLACE FUNCTION public.guard_ica_linehaul_split()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;  -- service role: design (d), the caller's own check
  END IF;

  IF NEW.linehaul_split_pct IS DISTINCT FROM OLD.linehaul_split_pct
     AND COALESCE(OLD.status, 'draft') <> 'draft'
     AND NOT public.has_permission(auth.uid(), 'driver_pay.change')
  THEN
    RAISE EXCEPTION
      'Not authorized to change the linehaul split on an agreement that has already been sent for signature. Only the owner can change a driver''s contracted pay at this point.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.guard_ica_linehaul_split() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.guard_ica_linehaul_split() FROM anon;
REVOKE EXECUTE ON FUNCTION public.guard_ica_linehaul_split() FROM authenticated;

DROP TRIGGER IF EXISTS ab_guard_ica_linehaul_split ON public.ica_contracts;
CREATE TRIGGER ab_guard_ica_linehaul_split
  BEFORE UPDATE ON public.ica_contracts
  FOR EACH ROW EXECUTE FUNCTION public.guard_ica_linehaul_split();

-- 4. THE DRIVER-RECORD PERCENTAGE — owner-only at all times.
CREATE OR REPLACE FUNCTION public.guard_operator_pay_percentage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;  -- service role: design (d), the caller's own check
  END IF;

  IF NEW.pay_percentage IS DISTINCT FROM OLD.pay_percentage
     AND NOT public.has_permission(auth.uid(), 'driver_pay.change')
  THEN
    RAISE EXCEPTION
      'Not authorized to change a driver''s pay percentage. Only the owner can change a driver''s contracted pay.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.guard_operator_pay_percentage() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.guard_operator_pay_percentage() FROM anon;
REVOKE EXECUTE ON FUNCTION public.guard_operator_pay_percentage() FROM authenticated;

DROP TRIGGER IF EXISTS ab_guard_operator_pay_percentage ON public.operators;
CREATE TRIGGER ab_guard_operator_pay_percentage
  BEFORE UPDATE ON public.operators
  FOR EACH ROW EXECUTE FUNCTION public.guard_operator_pay_percentage();

COMMENT ON COLUMN public.operators.pay_percentage IS
  'Driver''s contracted linehaul share on the driver record. Owner-only (driver_pay.change) — see migration 0027. NOTE: the same figure also lives on ica_contracts.linehaul_split_pct and nothing keeps the two in step (recorded for the versioning pass, P31).';
