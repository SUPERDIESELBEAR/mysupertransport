-- Convention (rule 2): every SECURITY DEFINER function pins search_path to
-- 'public, extensions'. The previous migration carried these two forward with
-- their old single-schema setting.
ALTER FUNCTION public.enforce_rods_certified_continuity() SET search_path TO 'public', 'extensions';
ALTER FUNCTION public.enforce_eld_event_driver_update() SET search_path TO 'public', 'extensions';