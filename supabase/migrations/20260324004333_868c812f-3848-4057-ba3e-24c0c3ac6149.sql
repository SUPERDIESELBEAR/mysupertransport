-- Add is_active column to operators table (default true — all existing operators are active)
ALTER TABLE public.operators
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;

-- Management can toggle the is_active flag
CREATE POLICY "Management can deactivate operators"
  ON public.operators
  FOR UPDATE
  USING (has_role(auth.uid(), 'management'::app_role))
  WITH CHECK (has_role(auth.uid(), 'management'::app_role));
