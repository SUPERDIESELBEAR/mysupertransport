-- Create truck_maintenance_records table
CREATE TABLE public.truck_maintenance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  service_date date NOT NULL,
  odometer integer,
  shop_name text,
  amount numeric(10,2),
  description text,
  invoice_number text,
  categories text[] DEFAULT '{}',
  invoice_file_url text,
  invoice_file_path text,
  invoice_file_name text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.truck_maintenance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage maintenance records"
  ON public.truck_maintenance_records FOR ALL
  USING (is_staff(auth.uid()))
  WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Operators can view own maintenance records"
  ON public.truck_maintenance_records FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.operators
    WHERE operators.id = truck_maintenance_records.operator_id
      AND operators.user_id = auth.uid()
  ));

-- Create truck_dot_inspections table
CREATE TABLE public.truck_dot_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  inspection_date date NOT NULL,
  reminder_interval integer NOT NULL DEFAULT 360,
  next_due_date date,
  inspector_name text,
  location text,
  result text NOT NULL DEFAULT 'pass',
  certificate_file_url text,
  certificate_file_path text,
  certificate_file_name text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.truck_dot_inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage DOT inspections"
  ON public.truck_dot_inspections FOR ALL
  USING (is_staff(auth.uid()))
  WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Operators can view own DOT inspections"
  ON public.truck_dot_inspections FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.operators
    WHERE operators.id = truck_dot_inspections.operator_id
      AND operators.user_id = auth.uid()
  ));

-- Trigger to auto-compute next_due_date
CREATE OR REPLACE FUNCTION public.compute_dot_next_due_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.next_due_date := NEW.inspection_date + (NEW.reminder_interval * INTERVAL '1 day');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_compute_dot_next_due
  BEFORE INSERT OR UPDATE ON public.truck_dot_inspections
  FOR EACH ROW
  EXECUTE FUNCTION public.compute_dot_next_due_date();

-- Storage bucket for fleet documents (invoices, certificates)
INSERT INTO storage.buckets (id, name, public)
VALUES ('fleet-documents', 'fleet-documents', false);

CREATE POLICY "Staff can upload fleet documents"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'fleet-documents' AND is_staff(auth.uid()));

CREATE POLICY "Staff can view fleet documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'fleet-documents' AND is_staff(auth.uid()));

CREATE POLICY "Staff can delete fleet documents"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'fleet-documents' AND is_staff(auth.uid()));

CREATE POLICY "Operators can view own fleet documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'fleet-documents'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.operators WHERE user_id = auth.uid()
    )
  );