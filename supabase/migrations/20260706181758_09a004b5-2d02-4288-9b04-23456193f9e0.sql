REVOKE ALL ON FUNCTION public.enforce_onboarding_status_operator_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_onboarding_status_operator_update() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_onboarding_status_operator_update() FROM authenticated;

REVOKE ALL ON FUNCTION public.enforce_onboarding_status_operator_column_whitelist() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_onboarding_status_operator_column_whitelist() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_onboarding_status_operator_column_whitelist() FROM authenticated;