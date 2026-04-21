-- Enable realtime for equipment_assignments so the Operator Detail Panel
-- can refresh shipping chips instantly when staff assign / edit / return
-- equipment in the Equipment Inventory or History modals.
ALTER TABLE public.equipment_assignments REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'equipment_assignments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.equipment_assignments;
  END IF;
END $$;
