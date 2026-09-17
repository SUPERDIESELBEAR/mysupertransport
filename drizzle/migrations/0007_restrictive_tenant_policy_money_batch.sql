-- RESTRICTIVE TENANT POLICY — MONEY BATCH (21 tables).
-- The owner's read-enforcement decision of 2026-09-16, the pilot's exact policy,
-- nothing else. No permissive policy, column, trigger, grant or row is touched.
--
-- GROUP 1 — the twelve of the 2026-09-16 record, section
-- "(c) THE LIVE READ-ENFORCEMENT CENSUS — `company_id` is enforced on reads on 12 tables".
-- Every permissive policy on these already reads
-- `(company_id = current_company_id()) AND <role test>`, so this restrictive rule is a
-- NO-OP for them today: it can only subtract rows the permissive policy already excludes.
-- It is added anyway so that a future widening of a role test cannot reopen the table.

CREATE POLICY tenant_isolation ON public.invoices
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

CREATE POLICY tenant_isolation ON public.invoice_line_items
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

CREATE POLICY tenant_isolation ON public.invoice_batches
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

CREATE POLICY tenant_isolation ON public.invoice_number_config
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

CREATE POLICY tenant_isolation ON public.payments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

CREATE POLICY tenant_isolation ON public.factoring_remittances
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

CREATE POLICY tenant_isolation ON public.ar_aging_snapshots
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

CREATE POLICY tenant_isolation ON public.accessorial_adjustments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

CREATE POLICY tenant_isolation ON public.settlement_settings
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

CREATE POLICY tenant_isolation ON public.carrier_signature_settings
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

-- share_tokens is treated as a MONEY-GROUP table here, not a share-link table: it is one of
-- the census twelve and already tests company_id on every authenticated policy. The PUBLIC
-- token path does not read this table as `authenticated`, so a RESTRICTIVE ... TO authenticated
-- policy cannot affect an unauthenticated share link.
CREATE POLICY tenant_isolation ON public.share_tokens
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

CREATE POLICY tenant_isolation ON public.unit_number_config
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

-- GROUP 2 — money tables whose permissive policies are ROLE-ONLY or OWNERSHIP-ONLY on reads
-- today. For these the rule is REAL, not a no-op: it is the first row-level company test
-- they have ever carried.

CREATE POLICY tenant_isolation ON public.settlements
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

CREATE POLICY tenant_isolation ON public.settlement_line_items
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

CREATE POLICY tenant_isolation ON public.settlement_withheld_loads
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

CREATE POLICY tenant_isolation ON public.dispatch_settlements
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

CREATE POLICY tenant_isolation ON public.dispatch_settlement_line_items
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

CREATE POLICY tenant_isolation ON public.deductions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

CREATE POLICY tenant_isolation ON public.deduction_installments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

CREATE POLICY tenant_isolation ON public.load_charges
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

CREATE POLICY tenant_isolation ON public.inspection_program_payments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));
