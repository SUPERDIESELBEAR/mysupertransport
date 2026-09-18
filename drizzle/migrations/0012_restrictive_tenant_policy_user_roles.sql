-- THE LAST TABLE. Pilot's exact restrictive shape, nothing else.
-- Undo, if any identity loses a role or a portal:
--   DROP POLICY tenant_isolation ON public.user_roles;
CREATE POLICY tenant_isolation ON public.user_roles
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));