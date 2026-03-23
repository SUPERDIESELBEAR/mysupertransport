
-- ─────────────────────────────────────────────
-- Equipment Items table
-- ─────────────────────────────────────────────
CREATE TABLE public.equipment_items (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_type     TEXT NOT NULL CHECK (device_type IN ('eld','dash_cam','bestpass','fuel_card')),
  serial_number   TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','assigned','damaged','lost')),
  notes           TEXT,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.equipment_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view equipment items"
  ON public.equipment_items FOR SELECT
  USING (is_staff(auth.uid()));

CREATE POLICY "Staff can insert equipment items"
  ON public.equipment_items FOR INSERT
  WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Staff can update equipment items"
  ON public.equipment_items FOR UPDATE
  USING (is_staff(auth.uid()));

CREATE POLICY "Management can delete equipment items"
  ON public.equipment_items FOR DELETE
  USING (has_role(auth.uid(), 'management'::app_role));

CREATE TRIGGER update_equipment_items_updated_at
  BEFORE UPDATE ON public.equipment_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────
-- Equipment Assignments table (full history)
-- ─────────────────────────────────────────────
CREATE TABLE public.equipment_assignments (
  id               UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id     UUID NOT NULL REFERENCES public.equipment_items(id) ON DELETE CASCADE,
  operator_id      UUID NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  assigned_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  assigned_by      UUID,
  returned_at      TIMESTAMP WITH TIME ZONE,
  return_condition TEXT CHECK (return_condition IN ('available','damaged','lost')),
  notes            TEXT,
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.equipment_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view equipment assignments"
  ON public.equipment_assignments FOR SELECT
  USING (is_staff(auth.uid()));

CREATE POLICY "Staff can insert equipment assignments"
  ON public.equipment_assignments FOR INSERT
  WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Staff can update equipment assignments"
  ON public.equipment_assignments FOR UPDATE
  USING (is_staff(auth.uid()));

CREATE POLICY "Management can delete equipment assignments"
  ON public.equipment_assignments FOR DELETE
  USING (has_role(auth.uid(), 'management'::app_role));

CREATE INDEX idx_equipment_assignments_equipment_id ON public.equipment_assignments(equipment_id);
CREATE INDEX idx_equipment_assignments_operator_id  ON public.equipment_assignments(operator_id);
CREATE INDEX idx_equipment_items_device_type        ON public.equipment_items(device_type);
CREATE INDEX idx_equipment_items_status             ON public.equipment_items(status);
