CREATE TABLE public.claim_flag_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_flag_id uuid NOT NULL REFERENCES public.claim_flags(id) ON DELETE CASCADE,
  load_id uuid NOT NULL REFERENCES public.loads(id) ON DELETE CASCADE,
  action text NOT NULL,
  previous_flag_level claim_flag_level,
  new_flag_level claim_flag_level,
  previous_is_active boolean,
  new_is_active boolean,
  previous_resolution text,
  new_resolution text,
  previous_estimated_amount numeric,
  new_estimated_amount numeric,
  previous_actual_amount numeric,
  new_actual_amount numeric,
  change_source text,
  notes text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

GRANT SELECT ON public.claim_flag_history TO authenticated;
GRANT ALL ON public.claim_flag_history TO service_role;

ALTER TABLE public.claim_flag_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view claim flag history"
ON public.claim_flag_history FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'management') OR
  public.has_role(auth.uid(), 'owner') OR
  public.has_role(auth.uid(), 'dispatcher') OR
  public.has_role(auth.uid(), 'onboarding_staff')
);

CREATE INDEX idx_claim_flag_history_claim_flag_id ON public.claim_flag_history(claim_flag_id);
CREATE INDEX idx_claim_flag_history_load_id ON public.claim_flag_history(load_id);
CREATE INDEX idx_claim_flag_history_changed_at ON public.claim_flag_history(changed_at);

CREATE OR REPLACE FUNCTION public.log_claim_flag_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.claim_flag_history (
      claim_flag_id, load_id, action,
      new_flag_level, new_is_active, new_resolution,
      new_estimated_amount, new_actual_amount, changed_by
    ) VALUES (
      NEW.id, NEW.load_id, 'created',
      NEW.flag_level, NEW.is_active, NEW.resolution,
      NEW.estimated_claim_amount, NEW.actual_claim_amount, auth.uid()
    );
    RETURN NEW;
  END IF;

  IF NEW.flag_level IS DISTINCT FROM OLD.flag_level
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.resolution IS DISTINCT FROM OLD.resolution
     OR NEW.estimated_claim_amount IS DISTINCT FROM OLD.estimated_claim_amount
     OR NEW.actual_claim_amount IS DISTINCT FROM OLD.actual_claim_amount
  THEN
    IF OLD.is_active IS TRUE AND NEW.is_active IS FALSE THEN
      v_action := 'resolved';
    ELSIF OLD.is_active IS FALSE AND NEW.is_active IS TRUE THEN
      v_action := 'reopened';
    ELSE
      v_action := 'updated';
    END IF;

    INSERT INTO public.claim_flag_history (
      claim_flag_id, load_id, action,
      previous_flag_level, new_flag_level,
      previous_is_active, new_is_active,
      previous_resolution, new_resolution,
      previous_estimated_amount, new_estimated_amount,
      previous_actual_amount, new_actual_amount,
      changed_by
    ) VALUES (
      NEW.id, NEW.load_id, v_action,
      OLD.flag_level, NEW.flag_level,
      OLD.is_active, NEW.is_active,
      OLD.resolution, NEW.resolution,
      OLD.estimated_claim_amount, NEW.estimated_claim_amount,
      OLD.actual_claim_amount, NEW.actual_claim_amount,
      auth.uid()
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_claim_flag_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_claim_flags_zz_history
AFTER INSERT OR UPDATE ON public.claim_flags
FOR EACH ROW EXECUTE FUNCTION public.log_claim_flag_change();