-- Rename existing IRP Registration rows to new label and move to per_driver scope
-- driver_id is left null; staff will re-upload per-driver IRP docs going forward
UPDATE public.inspection_documents
SET
  name  = 'IRP Registration (cab card)',
  scope = 'per_driver'
WHERE name = 'IRP Registration'
  AND scope = 'company_wide';