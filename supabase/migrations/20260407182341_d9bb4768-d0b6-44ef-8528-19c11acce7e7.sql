
UPDATE public.pipeline_config
SET items = '[
  {"key":"ica_issued","label":"Contract Issued","field":"ica_status","complete_value":"in_progress|sent_for_signature|complete","note":"Anything other than not_issued"},
  {"key":"ica_sent","label":"Sent for Signature","field":"ica_status","complete_value":"sent_for_signature|complete"},
  {"key":"ica_complete","label":"Fully Signed","field":"ica_status","complete_value":"complete"}
]'::jsonb,
    updated_at = now()
WHERE id = '84d72a49-1880-4326-a072-ffe602757325';
