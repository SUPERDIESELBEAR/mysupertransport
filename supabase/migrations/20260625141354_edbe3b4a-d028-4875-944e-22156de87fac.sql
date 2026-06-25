DO $$ BEGIN
  ALTER TABLE public.onboarding_status REPLICA IDENTITY FULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.operator_documents REPLICA IDENTITY FULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.onboarding_status;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.operator_documents;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;