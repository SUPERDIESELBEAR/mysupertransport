ALTER TABLE public.loads
  ADD COLUMN IF NOT EXISTS loadout_use_window_source text
    CHECK (loadout_use_window_source IN ('document', 'derived'));

COMMENT ON COLUMN public.loads.loadout_use_window_source IS
  'Provenance of loadout_use_start/loadout_use_end: ''document'' = stated on the rate confirmation or confirmed by a human edit; ''derived'' = inferred from the first and last stop appointment dates and still needs broker confirmation. NULL when no window is recorded.';

-- One field, two column names: the form wrote loadout_use_start/end while Load
-- Detail read loadout_use_period_start/end, so a saved window rendered empty.
-- Carry anything stored in the unused pair over, then remove it.
UPDATE public.loads
   SET loadout_use_start = COALESCE(loadout_use_start, loadout_use_period_start),
       loadout_use_end   = COALESCE(loadout_use_end, loadout_use_period_end)
 WHERE loadout_use_period_start IS NOT NULL
    OR loadout_use_period_end IS NOT NULL;

ALTER TABLE public.loads DROP COLUMN IF EXISTS loadout_use_period_start;
ALTER TABLE public.loads DROP COLUMN IF EXISTS loadout_use_period_end;

COMMENT ON COLUMN public.loads.loadout_use_start IS 'First day of the agreed trailer use window. See loadout_use_window_source for whether it was stated or inferred.';
COMMENT ON COLUMN public.loads.loadout_use_end IS 'Last day of the agreed trailer use window. See loadout_use_window_source for whether it was stated or inferred.';

COMMENT ON COLUMN public.loads.loadout_relocation_fee IS
  'Relocation revenue billed to the broker for moving the trailer. Shown in the app as "Relocation pay" only in the sense of what the load pays the company; the driver receives a configurable percentage of it via the pay policy engine, never this full amount. Column name is retained because stored change-history rows reference it.';