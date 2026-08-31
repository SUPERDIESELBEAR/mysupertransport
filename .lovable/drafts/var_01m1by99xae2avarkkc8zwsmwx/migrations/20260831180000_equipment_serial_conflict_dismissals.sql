-- Persist "These are different devices" decisions for serial conflicts so they
-- are shared across staff, devices, and browser profiles instead of being
-- trapped in localStorage.

CREATE TABLE public.equipment_serial_conflict_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conflict_key text NOT NULL UNIQUE,
  device_type text NOT NULL,
  item_ids uuid[] NOT NULL,
  serial_snapshot text[] NOT NULL,
  dismissed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  dismissed_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.equipment_serial_conflict_dismissals TO authenticated;
GRANT ALL ON public.equipment_serial_conflict_dismissals TO service_role;

ALTER TABLE public.equipment_serial_conflict_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view conflict dismissals"
  ON public.equipment_serial_conflict_dismissals
  FOR SELECT
  TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "Staff can create conflict dismissals"
  ON public.equipment_serial_conflict_dismissals
  FOR INSERT
  TO authenticated
  WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Staff can delete conflict dismissals"
  ON public.equipment_serial_conflict_dismissals
  FOR DELETE
  TO authenticated
  USING (is_staff(auth.uid()));
