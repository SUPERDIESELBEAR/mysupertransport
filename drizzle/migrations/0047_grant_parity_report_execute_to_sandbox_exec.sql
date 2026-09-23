-- The read-only grant-parity report is already executable by the project-specific
-- sandbox harness role (sandbox_exec_qgxpkcudwjmacrdcyvhj). The sandbox now connects
-- as the generic sandbox_exec role, which left src/test/grant-parity-live.test.ts
-- unable to read its own report and the safety net red. Same class of grant, same
-- read-only report, no client role touched: anon, authenticated and PUBLIC still
-- cannot execute it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.grant_parity_report() TO sandbox_exec';
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.grant_parity_report() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_parity_report() FROM anon;
REVOKE EXECUTE ON FUNCTION public.grant_parity_report() FROM authenticated;