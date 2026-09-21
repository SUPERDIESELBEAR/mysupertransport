-- Backfill: applicants archived from the onboarding pipeline were filed as
-- 'denied' with a "[Archived from pipeline]" note prefix. Move them to the new
-- 'archived' outcome and drop the now-redundant prefix from the reason.
--
-- Runs after 20260921150000 adds the enum value: a new enum value cannot be
-- used in the same transaction that creates it.
--
-- Undo:
--   UPDATE public.applications SET review_status = 'denied'
--    WHERE review_status = 'archived';

UPDATE public.applications
   SET review_status = 'archived',
       reviewer_notes = NULLIF(
         btrim(regexp_replace(reviewer_notes, '^\[Archived from pipeline\]\s*', '')),
         ''
       )
 WHERE review_status = 'denied'
   AND reviewer_notes LIKE '[Archived from pipeline]%';
