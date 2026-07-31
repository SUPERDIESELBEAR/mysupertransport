-- The 4-arg form with a defaulted _late makes 3-arg named calls ambiguous.
DROP FUNCTION IF EXISTS public.record_rods_purge_storage_result(uuid, text[], jsonb);