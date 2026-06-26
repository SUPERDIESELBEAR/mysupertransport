ALTER TABLE public.onboarding_status DISABLE TRIGGER USER;

UPDATE public.onboarding_status os
SET ica_status = 'complete', updated_at = now()
FROM public.ica_contracts ic
WHERE ic.operator_id = os.operator_id
  AND (ic.status = 'fully_executed' OR ic.contractor_signed_at IS NOT NULL)
  AND COALESCE(os.ica_status::text, '') <> 'complete';

ALTER TABLE public.onboarding_status ENABLE TRIGGER USER;