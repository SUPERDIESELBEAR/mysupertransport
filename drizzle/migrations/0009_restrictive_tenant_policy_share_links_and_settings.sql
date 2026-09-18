-- RESTRICTIVE TENANT POLICY — SHARE LINKS (5) and SMALL SETTINGS (2).
-- The pilot's exact policy per table, nothing else. No permissive policy,
-- column, trigger, grant or row is touched.
--
-- SHARE LINKS. Every signed-out path into these tables runs through a
-- SECURITY DEFINER function (resolve_short_link, get_ica_review_link,
-- resolve_share_bundle / get_share_bundle_meta) or through an edge function
-- holding service_role (create-preview-session, redeem-preview-session,
-- send-officer-packet). A RESTRICTIVE ... TO authenticated policy therefore
-- cannot reach an anonymous visitor on any of them. `preview_sessions`
-- additionally has one permissive policy, `ALL ... USING false`, so no client
-- of any kind reads it. `document_short_links` and
-- `message_notification_throttle` carry no permissive policy at all.
-- All seven columns are NOT NULL with zero nulls, verified live before this ran.

CREATE POLICY tenant_isolation ON public.document_short_links
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

CREATE POLICY tenant_isolation ON public.officer_packet_links
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

CREATE POLICY tenant_isolation ON public.ica_review_links
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

CREATE POLICY tenant_isolation ON public.binder_share_bundles
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

CREATE POLICY tenant_isolation ON public.preview_sessions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

-- SMALL SETTINGS. `contractor_pay_setup` is deliberately NOT here: it is
-- driver pay data read on the driver's own pay screens, so it gets the
-- money-batch treatment in its own pass (owner decision, 2026-09-17 2300).

CREATE POLICY tenant_isolation ON public.inspection_program_settings
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

CREATE POLICY tenant_isolation ON public.message_notification_throttle
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));