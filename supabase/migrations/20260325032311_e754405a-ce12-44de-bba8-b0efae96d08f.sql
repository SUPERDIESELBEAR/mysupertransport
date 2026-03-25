
-- Add on_hold fields to the operators table
ALTER TABLE public.operators
  ADD COLUMN on_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN on_hold_reason text,
  ADD COLUMN on_hold_date date;
