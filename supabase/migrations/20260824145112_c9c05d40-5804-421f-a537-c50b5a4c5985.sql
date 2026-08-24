ALTER TABLE public.parser_diagnostics DROP CONSTRAINT IF EXISTS parser_diagnostics_kind_check;
ALTER TABLE public.parser_diagnostics ADD CONSTRAINT parser_diagnostics_kind_check
  CHECK (kind = ANY (ARRAY['anchor_miss','reference_label_unrecognized','reference_row_dropped','loadout_assessment']));