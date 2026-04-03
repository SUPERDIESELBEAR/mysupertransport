CREATE POLICY "Operators can insert their own documents"
  ON public.operator_documents
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM operators
      WHERE operators.id = operator_documents.operator_id
        AND operators.user_id = auth.uid()
    )
  );