-- Allow operators to update only their own decal install photos
CREATE POLICY "Operators can update their own decal photos"
  ON public.onboarding_status
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.operators
      WHERE operators.id = onboarding_status.operator_id
        AND operators.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.operators
      WHERE operators.id = onboarding_status.operator_id
        AND operators.user_id = auth.uid()
    )
  );