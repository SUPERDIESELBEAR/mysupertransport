-- Add an 'archived' outcome to review_status so applicants who are set aside
-- (may be hired later) are no longer filed as 'denied'.
--
-- Additive only. Undo: there is no safe removal of an enum value; to reverse,
-- stop writing 'archived' and move affected rows back with
--   UPDATE public.applications SET review_status = 'denied' WHERE review_status = 'archived';
-- (the value itself stays on the type).

ALTER TYPE public.review_status ADD VALUE IF NOT EXISTS 'archived';
