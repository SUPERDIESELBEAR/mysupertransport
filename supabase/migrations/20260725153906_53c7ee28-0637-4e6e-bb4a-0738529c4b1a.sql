DROP POLICY IF EXISTS "osas_operator_sign" ON public.onboard_assignment_sheets;

CREATE POLICY "osas_operator_sign"
  ON public.onboard_assignment_sheets
  FOR UPDATE
  TO authenticated
  USING (
    status IN ('sent','signed')
    AND EXISTS (
      SELECT 1
      FROM public.operators o
      WHERE o.id = onboard_assignment_sheets.operator_id
        AND o.user_id = auth.uid()
    )
  )
  WITH CHECK (
    status IN ('sent','signed')
    AND EXISTS (
      SELECT 1
      FROM public.operators o
      WHERE o.id = onboard_assignment_sheets.operator_id
        AND o.user_id = auth.uid()
    )
  );