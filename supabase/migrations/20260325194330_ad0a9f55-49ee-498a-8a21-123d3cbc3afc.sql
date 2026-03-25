-- Create mo_plates table
CREATE TABLE public.mo_plates (
  id             uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plate_number   text         NOT NULL,
  registration_number text    NULL,
  notes          text         NULL,
  status         text         NOT NULL DEFAULT 'available'
                              CHECK (status IN ('available','assigned','lost_stolen','retired')),
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now()
);

-- Create mo_plate_assignments table (history)
CREATE TABLE public.mo_plate_assignments (
  id             uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plate_id       uuid         NOT NULL REFERENCES public.mo_plates(id) ON DELETE CASCADE,
  operator_id    uuid         NULL      REFERENCES public.operators(id) ON DELETE SET NULL,
  driver_name    text         NOT NULL,
  unit_number    text         NULL,
  event_type     text         NOT NULL DEFAULT 'assignment'
                              CHECK (event_type IN ('assignment','lost_stolen','replacement_received')),
  assigned_at    timestamptz  NOT NULL DEFAULT now(),
  returned_at    timestamptz  NULL,
  notes          text         NULL,
  assigned_by    uuid         NULL,
  returned_by    uuid         NULL
);

-- Enable RLS
ALTER TABLE public.mo_plates            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mo_plate_assignments ENABLE ROW LEVEL SECURITY;

-- mo_plates RLS policies
CREATE POLICY "Staff can view mo_plates"
  ON public.mo_plates FOR SELECT
  USING (is_staff(auth.uid()));

CREATE POLICY "Staff can insert mo_plates"
  ON public.mo_plates FOR INSERT
  WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Staff can update mo_plates"
  ON public.mo_plates FOR UPDATE
  USING (is_staff(auth.uid()));

CREATE POLICY "Management can delete mo_plates"
  ON public.mo_plates FOR DELETE
  USING (has_role(auth.uid(), 'management'::app_role));

-- mo_plate_assignments RLS policies
CREATE POLICY "Staff can view mo_plate_assignments"
  ON public.mo_plate_assignments FOR SELECT
  USING (is_staff(auth.uid()));

CREATE POLICY "Staff can insert mo_plate_assignments"
  ON public.mo_plate_assignments FOR INSERT
  WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Staff can update mo_plate_assignments"
  ON public.mo_plate_assignments FOR UPDATE
  USING (is_staff(auth.uid()));

CREATE POLICY "Management can delete mo_plate_assignments"
  ON public.mo_plate_assignments FOR DELETE
  USING (has_role(auth.uid(), 'management'::app_role));

-- updated_at trigger for mo_plates
CREATE TRIGGER update_mo_plates_updated_at
  BEFORE UPDATE ON public.mo_plates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();