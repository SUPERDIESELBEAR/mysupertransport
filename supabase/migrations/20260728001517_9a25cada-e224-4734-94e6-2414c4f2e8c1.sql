ALTER TYPE public.osas_device_type ADD VALUE IF NOT EXISTS 'license_plate';
ALTER TYPE public.osas_device_type ADD VALUE IF NOT EXISTS 'registration';

ALTER TABLE public.onboard_assignment_sheet_items
  ADD COLUMN IF NOT EXISTS plate_assignment_id uuid REFERENCES public.mo_plate_assignments(id) ON DELETE SET NULL;