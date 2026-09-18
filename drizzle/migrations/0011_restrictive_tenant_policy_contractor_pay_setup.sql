CREATE POLICY tenant_isolation ON public.contractor_pay_setup
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));