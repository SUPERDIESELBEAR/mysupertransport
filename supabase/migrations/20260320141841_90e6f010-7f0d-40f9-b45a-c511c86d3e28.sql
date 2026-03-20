
-- Create the pipeline_config table to store stage definitions and completion criteria
CREATE TABLE public.pipeline_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stage_key TEXT NOT NULL UNIQUE,
  stage_order INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL,
  full_name TEXT NOT NULL,
  description TEXT,
  items JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.pipeline_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read pipeline config"
  ON public.pipeline_config FOR SELECT
  USING (is_staff(auth.uid()));

CREATE POLICY "Management can insert pipeline config"
  ON public.pipeline_config FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'management'::app_role));

CREATE POLICY "Management can update pipeline config"
  ON public.pipeline_config FOR UPDATE
  USING (has_role(auth.uid(), 'management'::app_role));

CREATE POLICY "Management can delete pipeline config"
  ON public.pipeline_config FOR DELETE
  USING (has_role(auth.uid(), 'management'::app_role));

CREATE TRIGGER update_pipeline_config_updated_at
  BEFORE UPDATE ON public.pipeline_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.pipeline_config (stage_key, stage_order, label, full_name, description, items) VALUES
(
  'bg', 1, 'BG', 'Background Check',
  'MVR (Motor Vehicle Record) and Clearinghouse background check for the operator.',
  '[
    {"key":"mvr_status","label":"MVR Requested","field":"mvr_status","complete_value":"received"},
    {"key":"ch_status","label":"Clearinghouse Requested","field":"ch_status","complete_value":"received"},
    {"key":"mvr_ch_approval","label":"MVR & CH Approved","field":"mvr_ch_approval","complete_value":"approved"}
  ]'::jsonb
),
(
  'docs', 2, 'Docs', 'Documents',
  'Required truck and compliance documents that must be on file before moving forward.',
  '[
    {"key":"form_2290","label":"Form 2290","field":"form_2290","complete_value":"received"},
    {"key":"truck_title","label":"Truck Title","field":"truck_title","complete_value":"received"},
    {"key":"truck_photos","label":"Truck Photos","field":"truck_photos","complete_value":"received"},
    {"key":"truck_inspection","label":"Truck Inspection","field":"truck_inspection","complete_value":"received"}
  ]'::jsonb
),
(
  'ica', 3, 'ICA', 'ICA Contract',
  'Independent Contractor Agreement — must be fully signed by both carrier and contractor.',
  '[
    {"key":"ica_issued","label":"Contract Issued","field":"ica_status","complete_value":"in_progress","note":"Anything other than not_issued"},
    {"key":"ica_sent","label":"Sent for Signature","field":"ica_status","complete_value":"sent_for_signature"},
    {"key":"ica_complete","label":"Fully Signed","field":"ica_status","complete_value":"complete"}
  ]'::jsonb
),
(
  'mo', 4, 'MO', 'MO Registration',
  'Missouri apportioned registration — docs submitted to the state and approval received.',
  '[
    {"key":"mo_docs_submitted","label":"MO Docs Submitted","field":"mo_docs_submitted","complete_value":"submitted"},
    {"key":"mo_reg_received","label":"MO Registration Received","field":"mo_reg_received","complete_value":"yes"}
  ]'::jsonb
),
(
  'equip', 5, 'Equip', 'Equipment Setup',
  'Physical truck equipment installs — decal, ELD device, and fuel card issuance.',
  '[
    {"key":"decal_applied","label":"Decal Applied","field":"decal_applied","complete_value":"yes"},
    {"key":"eld_installed","label":"ELD Installed","field":"eld_installed","complete_value":"yes"},
    {"key":"fuel_card_issued","label":"Fuel Card Issued","field":"fuel_card_issued","complete_value":"yes"}
  ]'::jsonb
),
(
  'ins', 6, 'Ins', 'Insurance',
  'Operator added to the company insurance policy — captured via insurance added date.',
  '[
    {"key":"insurance_added_date","label":"Added to Insurance Policy","field":"insurance_added_date","complete_value":"present","note":"Any non-null date counts as complete"}
  ]'::jsonb
);
