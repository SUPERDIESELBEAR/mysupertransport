-- Demo carrier, stage 3, pass 3c: carrier isolation on the applications and PEI
-- families. Standard shape everywhere except `applications`, which additionally
-- keeps the applicant's own row readable: an applicant who has signed in but is
-- not yet an operator or a staff member resolves to NO company, and
-- src/pages/ApplicationStatus.tsx reads his own row by user_id. Ten of the
-- eleven have no such self-path; they get the exact standard predicate.

CREATE POLICY tenant_isolation ON public.applications
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()) OR user_id = auth.uid())
  WITH CHECK (company_id = (SELECT public.current_company_id()) OR user_id = auth.uid());

CREATE POLICY tenant_isolation ON public.application_invites
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

CREATE POLICY tenant_isolation ON public.application_correction_requests
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

CREATE POLICY tenant_isolation ON public.application_correction_fields
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

CREATE POLICY tenant_isolation ON public.application_document_history
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

CREATE POLICY tenant_isolation ON public.application_interview_notes
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

CREATE POLICY tenant_isolation ON public.application_revision_attachments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

CREATE POLICY tenant_isolation ON public.pei_requests
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

CREATE POLICY tenant_isolation ON public.pei_responses
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

CREATE POLICY tenant_isolation ON public.pei_accidents
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

CREATE POLICY tenant_isolation ON public.pei_request_events
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));
