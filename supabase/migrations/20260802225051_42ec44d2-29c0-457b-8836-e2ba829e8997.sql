-- These four shipped pinned to `public` alone, which is the one pin shape the
-- live-catalog guard treats as unaccounted-for. Every other definer function in
-- this schema pins `public, extensions`; match it rather than grow an exemption
-- list. The pin is still explicit, so nothing resolves from a caller's path.
ALTER FUNCTION public.is_retention_admin(uuid) SET search_path TO 'public', 'extensions';
ALTER FUNCTION public.get_eld_compliance_timeline(uuid) SET search_path TO 'public', 'extensions';
ALTER FUNCTION public.search_retention_archive(uuid[], date, date, text, uuid, text, boolean) SET search_path TO 'public', 'extensions';
ALTER FUNCTION public.record_retention_export(text, uuid[], date, date, boolean, integer, integer, text, jsonb) SET search_path TO 'public', 'extensions';