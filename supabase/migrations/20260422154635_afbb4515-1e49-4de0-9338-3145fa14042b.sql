ALTER TABLE public.onboarding_status
  ADD COLUMN IF NOT EXISTS eld_exempt boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS eld_exempt_reason text NULL;

COMMENT ON COLUMN public.onboarding_status.eld_exempt IS 'When true, the truck is exempt from ELD requirements (FMCSA §395.8(a)(1)(iii) — pre-2000 truck). ELD device + dash cam are not required for Stage 5 completion.';
COMMENT ON COLUMN public.onboarding_status.eld_exempt_reason IS 'Optional staff note about why this truck is ELD exempt.';