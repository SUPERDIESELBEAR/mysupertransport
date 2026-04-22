ALTER TABLE public.operators
  ADD COLUMN excluded_from_dispatch boolean NOT NULL DEFAULT false,
  ADD COLUMN excluded_from_dispatch_reason text NULL,
  ADD COLUMN excluded_from_dispatch_at timestamptz NULL,
  ADD COLUMN excluded_from_dispatch_by uuid NULL;

CREATE INDEX IF NOT EXISTS idx_operators_excluded_from_dispatch
  ON public.operators(excluded_from_dispatch)
  WHERE excluded_from_dispatch = false;