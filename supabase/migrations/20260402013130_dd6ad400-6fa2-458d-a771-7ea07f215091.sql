
-- Create driver_vault_documents table
CREATE TABLE public.driver_vault_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  uploaded_by uuid,
  category text NOT NULL DEFAULT 'other',
  label text NOT NULL,
  file_url text,
  file_path text,
  file_name text,
  expires_at date,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

-- Enable RLS
ALTER TABLE public.driver_vault_documents ENABLE ROW LEVEL SECURITY;

-- Staff full access
CREATE POLICY "Staff can manage vault documents"
  ON public.driver_vault_documents
  FOR ALL
  USING (is_staff(auth.uid()))
  WITH CHECK (is_staff(auth.uid()));

-- Operators can view their own
CREATE POLICY "Operators can view their own vault documents"
  ON public.driver_vault_documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.operators
      WHERE operators.id = driver_vault_documents.operator_id
        AND operators.user_id = auth.uid()
    )
  );

-- Index for fast lookups
CREATE INDEX idx_driver_vault_documents_operator_id ON public.driver_vault_documents(operator_id);
CREATE INDEX idx_driver_vault_documents_expires_at ON public.driver_vault_documents(expires_at) WHERE expires_at IS NOT NULL;
