
-- Attach the onboarding status change trigger (was missing from previous migration)
DROP TRIGGER IF EXISTS on_onboarding_status_change ON public.onboarding_status;

CREATE TRIGGER on_onboarding_status_change
  AFTER UPDATE ON public.onboarding_status
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_operator_on_status_change();
