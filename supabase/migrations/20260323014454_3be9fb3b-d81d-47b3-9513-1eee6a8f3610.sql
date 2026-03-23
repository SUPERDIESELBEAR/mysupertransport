-- Stage 5 exception fields
ALTER TABLE public.onboarding_status
  ADD COLUMN IF NOT EXISTS paper_logbook_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS temp_decal_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exception_notes text,
  ADD COLUMN IF NOT EXISTS exception_approved_by uuid,
  ADD COLUMN IF NOT EXISTS exception_approved_at timestamptz;

-- Stage 7 — Go Live & Dispatch Readiness
ALTER TABLE public.onboarding_status
  ADD COLUMN IF NOT EXISTS dispatch_ready_orientation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dispatch_ready_consortium boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dispatch_ready_first_assigned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS go_live_date date,
  ADD COLUMN IF NOT EXISTS operator_type text;

-- Insert Stage 7 pipeline_config row (only if not already present)
INSERT INTO public.pipeline_config (stage_key, label, full_name, stage_order, items, description, is_active)
SELECT
  'dispatch',
  'Go Live',
  'Go Live & Dispatch Readiness',
  7,
  '[{"key":"go_live_date","label":"Go-Live Date Set","field":"go_live_date","complete_value":"present"}]'::jsonb,
  'Final go-live confirmation and dispatch readiness checklist',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.pipeline_config WHERE stage_key = 'dispatch'
);