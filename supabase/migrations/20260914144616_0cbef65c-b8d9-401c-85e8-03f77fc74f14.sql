-- carrier_profile read policy: scope to the caller's company.
--
-- Was USING (true) — every signed-in caller could read every carrier row. Held
-- open deliberately until a DRIVER could resolve a company: hydrate.ts caches
-- the seven carrier fields as the signed-in operator, and carrierIdentity.ts
-- BLOCKS federal record creation without that cache.
--
-- current_company_id() (2026-09-14) resolves membership first, then the
-- caller's OWN operators row, so the shape recorded as the eventual target
-- ("caller's company via company_members, OR the company of the operator row
-- the caller owns") is satisfied by the single predicate below.
--
-- Fail-closed is preserved: a caller who is neither a member nor an operator
-- resolves to NULL, and `id = NULL` is never true. Anonymous callers are not in
-- the policy's role list at all. Service-role readers bypass RLS entirely.
DROP POLICY IF EXISTS "Authenticated users can read the carrier profile" ON public.carrier_profile;

CREATE POLICY "Callers read only their own carrier profile"
  ON public.carrier_profile
  FOR SELECT
  TO authenticated
  USING (id = public.current_company_id());