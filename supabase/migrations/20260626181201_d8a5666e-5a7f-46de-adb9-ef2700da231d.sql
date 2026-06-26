ALTER TABLE public.ica_contracts REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ica_contracts;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;