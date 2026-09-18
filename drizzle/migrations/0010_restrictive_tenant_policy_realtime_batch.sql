-- Restrictive tenant isolation, LIVE-UPDATING (realtime) batch: the 19 tables
-- the app subscribes to or that sit alongside them in the dispatch surface.
-- Exact pilot shape: RESTRICTIVE, ALL, TO authenticated, company_id = current_company_id().
-- Nothing else changes; no function is created or replaced, so no grants change.

CREATE POLICY tenant_isolation ON public.dispatch_status_history AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT current_company_id())) WITH CHECK (company_id = (SELECT current_company_id()));

CREATE POLICY tenant_isolation ON public.driver_uploads AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT current_company_id())) WITH CHECK (company_id = (SELECT current_company_id()));

CREATE POLICY tenant_isolation ON public.equipment_assignments AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT current_company_id())) WITH CHECK (company_id = (SELECT current_company_id()));

CREATE POLICY tenant_isolation ON public.forecast_deductions AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT current_company_id())) WITH CHECK (company_id = (SELECT current_company_id()));

CREATE POLICY tenant_isolation ON public.forecast_expenses AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT current_company_id())) WITH CHECK (company_id = (SELECT current_company_id()));

CREATE POLICY tenant_isolation ON public.forecast_loads AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT current_company_id())) WITH CHECK (company_id = (SELECT current_company_id()));

CREATE POLICY tenant_isolation ON public.ica_contracts AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT current_company_id())) WITH CHECK (company_id = (SELECT current_company_id()));

CREATE POLICY tenant_isolation ON public.inspection_documents AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT current_company_id())) WITH CHECK (company_id = (SELECT current_company_id()));

CREATE POLICY tenant_isolation ON public.loads AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT current_company_id())) WITH CHECK (company_id = (SELECT current_company_id()));

CREATE POLICY tenant_isolation ON public.message_reactions AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT current_company_id())) WITH CHECK (company_id = (SELECT current_company_id()));

CREATE POLICY tenant_isolation ON public.messages AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT current_company_id())) WITH CHECK (company_id = (SELECT current_company_id()));

CREATE POLICY tenant_isolation ON public.notifications AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT current_company_id())) WITH CHECK (company_id = (SELECT current_company_id()));

CREATE POLICY tenant_isolation ON public.onboard_assignment_sheets AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT current_company_id())) WITH CHECK (company_id = (SELECT current_company_id()));

CREATE POLICY tenant_isolation ON public.onboarding_status AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT current_company_id())) WITH CHECK (company_id = (SELECT current_company_id()));

CREATE POLICY tenant_isolation ON public.operator_documents AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT current_company_id())) WITH CHECK (company_id = (SELECT current_company_id()));

CREATE POLICY tenant_isolation ON public.operators AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT current_company_id())) WITH CHECK (company_id = (SELECT current_company_id()));

CREATE POLICY tenant_isolation ON public.passenger_authorizations AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT current_company_id())) WITH CHECK (company_id = (SELECT current_company_id()));

CREATE POLICY tenant_isolation ON public.rate_con_ingest_queue AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT current_company_id())) WITH CHECK (company_id = (SELECT current_company_id()));

CREATE POLICY tenant_isolation ON public.truck_dot_inspections AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT current_company_id())) WITH CHECK (company_id = (SELECT current_company_id()));
