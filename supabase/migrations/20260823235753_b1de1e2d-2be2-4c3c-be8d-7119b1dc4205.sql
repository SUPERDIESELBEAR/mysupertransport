-- 1. The insert policy demanded created_by = auth.uid() while the column default
-- stamps current_profile_id() (a profiles.id). The two can never be equal, so
-- every diagnostic insert failed with 42501 and was swallowed by the client.
DROP POLICY IF EXISTS "Dispatch staff log parser diagnostics" ON public.parser_diagnostics;

CREATE POLICY "Dispatch staff log parser diagnostics"
ON public.parser_diagnostics
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = public.current_profile_id()
  AND (
    has_role(auth.uid(), 'dispatcher'::app_role)
    OR has_role(auth.uid(), 'management'::app_role)
    OR has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'onboarding_staff'::app_role)
  )
);

-- 2. The trailer use window is negotiated per load and printed on the rate
-- confirmation; it is not a fixed duration. Dates, not a day count.
ALTER TABLE public.loads
  ADD COLUMN IF NOT EXISTS loadout_use_start date,
  ADD COLUMN IF NOT EXISTS loadout_use_end date;

COMMENT ON COLUMN public.loads.loadout_use_start IS
  'Trailer relocation: first day the carrier may use the trailer, as stated on the rate confirmation.';
COMMENT ON COLUMN public.loads.loadout_use_end IS
  'Trailer relocation: last day of the granted trailer use window.';