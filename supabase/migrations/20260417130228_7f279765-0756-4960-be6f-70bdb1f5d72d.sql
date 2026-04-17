
CREATE TABLE public.driver_optional_docs (
  driver_id uuid NOT NULL,
  doc_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid,
  PRIMARY KEY (driver_id, doc_name)
);

ALTER TABLE public.driver_optional_docs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage driver optional docs"
ON public.driver_optional_docs
FOR ALL
USING (is_staff(auth.uid()))
WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Drivers can view their own optional docs"
ON public.driver_optional_docs
FOR SELECT
USING (auth.uid() = driver_id);

CREATE TRIGGER update_driver_optional_docs_updated_at
BEFORE UPDATE ON public.driver_optional_docs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
