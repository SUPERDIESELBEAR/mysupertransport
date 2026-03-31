ALTER TABLE public.onboarding_status
  ADD COLUMN truck_year text,
  ADD COLUMN truck_make text,
  ADD COLUMN truck_model text,
  ADD COLUMN truck_vin text,
  ADD COLUMN truck_plate text,
  ADD COLUMN truck_plate_state text;