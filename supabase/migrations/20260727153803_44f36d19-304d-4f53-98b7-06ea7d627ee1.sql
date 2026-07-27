-- Add audit fields to operators
ALTER TABLE public.operators
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivation_reason text,
  ADD COLUMN IF NOT EXISTS deactivated_by uuid REFERENCES auth.users(id);

-- Create offboarding step tracking table
CREATE TABLE IF NOT EXISTS public.operator_offboarding_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  step_key text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id),
  skipped boolean NOT NULL DEFAULT false,
  skipped_reason text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operator_id, step_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.operator_offboarding_steps TO authenticated;
GRANT ALL ON public.operator_offboarding_steps TO service_role;

ALTER TABLE public.operator_offboarding_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can manage offboarding steps for operators" ON public.operator_offboarding_steps;
CREATE POLICY "Staff can manage offboarding steps for operators"
  ON public.operator_offboarding_steps
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.operators o
      WHERE o.id = operator_offboarding_steps.operator_id
        AND (
          o.assigned_onboarding_staff = auth.uid()
          OR o.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role IN ('management', 'owner', 'onboarding_staff')
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.operators o
      WHERE o.id = operator_offboarding_steps.operator_id
        AND (
          o.assigned_onboarding_staff = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role IN ('management', 'owner', 'onboarding_staff')
          )
        )
    )
  );

DROP POLICY IF EXISTS "Service role can manage all offboarding steps" ON public.operator_offboarding_steps;
CREATE POLICY "Service role can manage all offboarding steps"
  ON public.operator_offboarding_steps
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Trigger function to keep updated_at fresh
CREATE OR REPLACE FUNCTION public.update_operator_offboarding_steps_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_operator_offboarding_steps_updated_at
  ON public.operator_offboarding_steps;
CREATE TRIGGER update_operator_offboarding_steps_updated_at
  BEFORE UPDATE ON public.operator_offboarding_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_operator_offboarding_steps_updated_at();

-- Update the deactivation trigger to stamp deactivated_at and clear on reactivation
CREATE OR REPLACE FUNCTION public.handle_operator_deactivated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_coordinator_id   UUID;
  v_operator_name    TEXT;
  v_app              RECORD;
BEGIN
  -- Only act when is_active changes
  IF OLD.is_active = NEW.is_active THEN
    RETURN NEW;
  END IF;

  -- Stamp or clear the deactivation audit timestamp
  IF OLD.is_active = TRUE AND NEW.is_active = FALSE THEN
    NEW.deactivated_at := COALESCE(NEW.deactivated_at, now());
  ELSIF OLD.is_active = FALSE AND NEW.is_active = TRUE THEN
    NEW.deactivated_at := NULL;
    NEW.deactivation_reason := NULL;
    NEW.deactivated_by := NULL;
  END IF;

  -- Only dispatch/notify on TRUE → FALSE
  IF NOT (OLD.is_active = TRUE AND NEW.is_active = FALSE) THEN
    RETURN NEW;
  END IF;

  -- 1. Reset dispatch status to not_dispatched and clear all operational state
  UPDATE public.active_dispatch
  SET
    dispatch_status     = 'not_dispatched',
    status_notes        = 'Automatically cleared on operator deactivation.',
    current_load_lane   = NULL,
    eta_redispatch      = NULL,
    assigned_dispatcher = NULL,
    updated_at          = now()
  WHERE operator_id = NEW.id;

  -- 2. Notify assigned onboarding coordinator
  v_coordinator_id := NEW.assigned_onboarding_staff;
  IF v_coordinator_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_operator_name := 'An operator';
  IF NEW.application_id IS NOT NULL THEN
    SELECT first_name, last_name INTO v_app
    FROM public.applications WHERE id = NEW.application_id;
    IF FOUND THEN
      v_operator_name := COALESCE(
        NULLIF(TRIM(COALESCE(v_app.first_name, '') || ' ' || COALESCE(v_app.last_name, '')), ''),
        'An operator'
      );
    END IF;
  END IF;

  INSERT INTO public.notifications (user_id, title, body, type, channel, link)
  VALUES (
    v_coordinator_id,
    'Driver deactivated — ' || v_operator_name,
    v_operator_name || ' has been deactivated and removed from the active roster. Their dispatch status has been reset to Not Dispatched.',
    'operator_deactivated',
    'in_app',
    '/staff?operator=' || NEW.id::text
  );

  RETURN NEW;
END;
$function$;

-- Ensure the trigger is attached (idempotent)
DROP TRIGGER IF EXISTS handle_operator_deactivated_trigger ON public.operators;
CREATE TRIGGER handle_operator_deactivated_trigger
  BEFORE UPDATE ON public.operators
  FOR EACH ROW EXECUTE FUNCTION public.handle_operator_deactivated();