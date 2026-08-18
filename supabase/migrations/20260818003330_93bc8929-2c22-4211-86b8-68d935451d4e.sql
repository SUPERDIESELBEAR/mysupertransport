ALTER TABLE public.rods_days ADD COLUMN IF NOT EXISTS bol_photo_path text;

COMMENT ON COLUMN public.rods_days.bol_photo_path IS
  'Storage path (rods bucket) of the driver''s photo of the day''s bill of lading / shipping document. Supporting evidence only: 49 CFR 395.8 requires the shipping document number OR shipper and commodity as TEXT on the form, and certify_rods_day''s header guard checks shipping_document_no. A photo never satisfies that guard and must never be treated as if it does.';

-- Driver-facing ELD-document filing is removed (tap-to-change redesign, 2026-08-18).
-- Zero rows exist with record_source = 'eld_document', so both routines are
-- unreachable in every sense. record_source, its CHECK value and the
-- P0019/P0045/P0046 guards stay, so re-adding a staff filing path later is one
-- additive migration. Recorded in docs/deferred-removals.md.
DROP FUNCTION IF EXISTS public.create_eld_document_day(uuid, date, text, jsonb, uuid, text, boolean);
DROP FUNCTION IF EXISTS public.replace_rods_document(uuid, text, text, uuid, text, boolean);