-- Vacant units: a truck that stays leased to the carrier after its driver is
-- deactivated. Additive only; nothing existing changes shape.

CREATE TABLE IF NOT EXISTS public.vacant_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  unit_number text,
  truck_year text,
  truck_make text,
  truck_model text,
  truck_vin text,
  truck_plate text,
  truck_plate_state text,
  trailer_number text,
  truck_owner_id uuid REFERENCES public.truck_owners(id) ON DELETE SET NULL,
  truck_owner_name text,
  disposition text NOT NULL DEFAULT 'truck_stays',
  notes text,
  held_at timestamptz NOT NULL DEFAULT now(),
  held_by uuid,
  released_at timestamptz,
  released_by uuid,
  release_reason text,
  resolved_operator_id uuid REFERENCES public.operators(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vacant_units_disposition_check CHECK (disposition IN ('truck_stays', 'undecided'))
);

CREATE INDEX IF NOT EXISTS idx_vacant_units_open ON public.vacant_units (released_at, held_at DESC);
CREATE INDEX IF NOT EXISTS idx_vacant_units_operator ON public.vacant_units (operator_id);

GRANT SELECT, INSERT, UPDATE ON public.vacant_units TO authenticated;
GRANT ALL ON public.vacant_units TO service_role;

ALTER TABLE public.vacant_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view vacant units"
ON public.vacant_units FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'management')
  OR public.has_role(auth.uid(), 'owner')
  OR public.has_role(auth.uid(), 'onboarding_staff')
  OR public.has_role(auth.uid(), 'dispatcher')
);

CREATE POLICY "Staff can hold vacant units"
ON public.vacant_units FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'management')
  OR public.has_role(auth.uid(), 'owner')
  OR public.has_role(auth.uid(), 'onboarding_staff')
);

CREATE POLICY "Staff can update vacant units"
ON public.vacant_units FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'management')
  OR public.has_role(auth.uid(), 'owner')
  OR public.has_role(auth.uid(), 'onboarding_staff')
)
WITH CHECK (
  public.has_role(auth.uid(), 'management')
  OR public.has_role(auth.uid(), 'owner')
  OR public.has_role(auth.uid(), 'onboarding_staff')
);

CREATE TRIGGER trg_vacant_units_updated_at
BEFORE UPDATE ON public.vacant_units
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
