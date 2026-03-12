
UPDATE public.applications
SET cdl_expiration = (CURRENT_DATE + INTERVAL '20 days')::date
WHERE id = '7dffa97d-1b6f-464a-86ba-0b6be5c7f9a7';
