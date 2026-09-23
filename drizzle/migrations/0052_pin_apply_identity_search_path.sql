-- 0052: pin search_path to "public, extensions" on the three functions this stage
-- authored or re-authored (0048, 0051). They were pinned to "public" alone, which the
-- standing convention forbids: a definer whose path omits "extensions" cannot see
-- pgcrypto and is easier to shadow. Settings only -- no body changes.

ALTER FUNCTION public.carrier_public_identity(text) SET search_path TO 'public', 'extensions';
ALTER FUNCTION public.carrier_identity_for_draft(text) SET search_path TO 'public', 'extensions';
ALTER FUNCTION public.save_application_draft(uuid, jsonb) SET search_path TO 'public', 'extensions';