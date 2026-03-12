-- Allow onboarding_staff/dispatcher/management to read audit_log entries
-- for operator entities (needed for Cert Expiry History timeline in OperatorDetailPanel)
CREATE POLICY "Staff can read operator audit log entries"
ON public.audit_log
FOR SELECT
USING (
  is_staff(auth.uid())
  AND entity_type = 'operator'
);