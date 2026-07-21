
-- Helper: validate a text path segment as a valid, in-progress application draft token
CREATE OR REPLACE FUNCTION public.is_valid_application_draft_token(_token text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.applications a
    WHERE a.is_draft = true
      AND a.draft_token IS NOT NULL
      AND a.draft_token::text = _token
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_valid_application_draft_token(text) TO anon, authenticated, service_role;

-- Replace overly-permissive anon upload policy for application documents
DROP POLICY IF EXISTS "Anyone can upload application docs under applications/" ON storage.objects;

CREATE POLICY "Applicants upload docs under their own draft token"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'application-documents'
  AND (storage.foldername(name))[1] = 'applications'
  AND (storage.foldername(name))[2] IS NOT NULL
  AND public.is_valid_application_draft_token((storage.foldername(name))[2])
  AND COALESCE((metadata ->> 'size')::bigint, 0) <= 20971520
  AND (
    lower(COALESCE(metadata ->> 'mimetype', '')) = ''
    OR lower(COALESCE(metadata ->> 'mimetype', '')) LIKE 'image/%'
    OR lower(COALESCE(metadata ->> 'mimetype', '')) = 'application/pdf'
  )
);

CREATE POLICY "Staff can upload application documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'application-documents'
  AND public.is_staff(auth.uid())
);

-- Replace overly-permissive anon upload policy for signatures
DROP POLICY IF EXISTS "Anyone can upload signatures under signatures/" ON storage.objects;

CREATE POLICY "Applicants upload signatures under their own draft token"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'signatures'
  AND (storage.foldername(name))[1] = 'signatures'
  AND (storage.foldername(name))[2] IS NOT NULL
  AND public.is_valid_application_draft_token((storage.foldername(name))[2])
  AND COALESCE((metadata ->> 'size')::bigint, 0) <= 2097152
  AND (
    COALESCE(metadata ->> 'mimetype', '') = ''
    OR lower(metadata ->> 'mimetype') LIKE 'image/%'
  )
);

CREATE POLICY "Staff can upload signatures"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'signatures'
  AND public.is_staff(auth.uid())
);

-- Passenger authorization signatures: only the edge function (service role) uploads; drop anon insert
DROP POLICY IF EXISTS "Anon upload passenger auth sigs" ON storage.objects;
