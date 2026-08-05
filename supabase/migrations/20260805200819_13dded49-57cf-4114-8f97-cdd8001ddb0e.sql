ALTER TABLE public.dot_consultant_email_settings
  ADD COLUMN IF NOT EXISTS consultant_name text,
  ADD COLUMN IF NOT EXISTS greeting_name text;

UPDATE public.dot_consultant_email_settings
SET consultant_name = COALESCE(consultant_name, 'Tracey L. McQuilken'),
    greeting_name = COALESCE(greeting_name, 'Tracey')
WHERE id = '00000000-0000-0000-0000-000000000001';