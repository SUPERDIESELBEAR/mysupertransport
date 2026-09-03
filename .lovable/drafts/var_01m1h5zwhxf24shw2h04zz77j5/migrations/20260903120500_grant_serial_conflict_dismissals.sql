-- The live database is missing the GRANTs that the table's original migration
-- file contains, so every read/insert/delete of a "these are different devices"
-- decision was refused by the Data API. Policies are already correct and are
-- left untouched; this restores the privileges only.

GRANT SELECT, INSERT, DELETE ON public.equipment_serial_conflict_dismissals TO authenticated;
GRANT ALL ON public.equipment_serial_conflict_dismissals TO service_role;
