CREATE OR REPLACE FUNCTION public.auto_handle_ingested_rate_con()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.broker_reference_number IS NULL OR btrim(NEW.broker_reference_number) = '' THEN
    RETURN NEW;
  END IF;
  UPDATE public.rate_con_ingest_queue q
     SET status = 'auto_handled',
         matched_load_id = NEW.id,
         updated_at = now()
   WHERE q.status IN ('received', 'pending_parse', 'parsed', 'needs_manual')
     AND q.broker_load_number IS NOT NULL
     AND lower(regexp_replace(q.broker_load_number, '[^0-9A-Za-z]', '', 'g'))
       = lower(regexp_replace(NEW.broker_reference_number, '[^0-9A-Za-z]', '', 'g'));
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auto_handle_ingested_rate_con() FROM PUBLIC, anon, authenticated;