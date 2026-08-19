CREATE TYPE public.claim_flag_level AS ENUM ('watch','hold','cleared');
CREATE TYPE public.claim_type AS ENUM ('damaged_goods','late_delivery','shortage','service_failure','rate_dispute','documentation_issue','other');

CREATE TABLE public.load_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id uuid NOT NULL REFERENCES public.loads(id) ON DELETE CASCADE,
  previous_status public.load_status,
  new_status public.load_status NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  change_source text,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.claim_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id uuid NOT NULL REFERENCES public.loads(id) ON DELETE CASCADE,
  flag_level public.claim_flag_level NOT NULL DEFAULT 'watch',
  claim_type public.claim_type NOT NULL DEFAULT 'other',
  reported_at timestamptz NOT NULL DEFAULT now(),
  reported_by_contact text,
  estimated_claim_amount numeric,
  actual_claim_amount numeric,
  description text NOT NULL,
  documentation_url text,
  is_active boolean NOT NULL DEFAULT true,
  resolution text,
  resolution_notes text,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

GRANT SELECT ON public.load_status_history TO authenticated;
GRANT ALL ON public.load_status_history TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.claim_flags TO authenticated;
GRANT ALL ON public.claim_flags TO service_role;

ALTER TABLE public.load_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_flags ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_load_status_history_load_id ON public.load_status_history(load_id);
CREATE INDEX idx_load_status_history_changed_at ON public.load_status_history(changed_at);
CREATE INDEX idx_load_status_history_new_status ON public.load_status_history(new_status);
CREATE INDEX idx_claim_flags_load_id ON public.claim_flags(load_id);
CREATE INDEX idx_claim_flags_flag_level ON public.claim_flags(flag_level);
CREATE INDEX idx_claim_flags_is_active ON public.claim_flags(is_active);
CREATE INDEX idx_claim_flags_active_hold ON public.claim_flags(load_id) WHERE is_active AND flag_level = 'hold';

CREATE TRIGGER trg_claim_flags_updated_at BEFORE UPDATE ON public.claim_flags
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.log_load_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.load_status_history (load_id, previous_status, new_status, changed_by)
  VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_load_status_change() FROM public, anon, authenticated;

CREATE TRIGGER trg_loads_log_status_change
AFTER UPDATE ON public.loads
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.log_load_status_change();

-- load_status_history policies (read only)
CREATE POLICY "load_status_history_staff_read" ON public.load_status_history
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'dispatcher') OR public.has_role(auth.uid(),'onboarding_staff'));

CREATE POLICY "load_status_history_operator_read_own" ON public.load_status_history
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.loads l JOIN public.operators o ON o.id = l.operator_id
  WHERE l.id = load_status_history.load_id AND o.user_id = auth.uid()
));

-- claim_flags policies
CREATE POLICY "claim_flags_staff_manage" ON public.claim_flags
FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'dispatcher'))
WITH CHECK (public.has_role(auth.uid(),'management') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'dispatcher'));

CREATE POLICY "claim_flags_onboarding_read" ON public.claim_flags
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'onboarding_staff'));