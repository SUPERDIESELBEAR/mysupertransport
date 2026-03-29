
-- Add employers JSONB column
ALTER TABLE public.applications ADD COLUMN employers jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Migrate existing data from employer_1-4 into the new array
UPDATE public.applications SET employers = COALESCE(
  (SELECT jsonb_agg(e ORDER BY ord) FROM (
    SELECT 1 AS ord, employer_1 AS e WHERE employer_1 IS NOT NULL AND employer_1::text <> '{}' AND employer_1::text <> 'null'
    UNION ALL
    SELECT 2, employer_2 WHERE employer_2 IS NOT NULL AND employer_2::text <> '{}' AND employer_2::text <> 'null'
    UNION ALL
    SELECT 3, employer_3 WHERE employer_3 IS NOT NULL AND employer_3::text <> '{}' AND employer_3::text <> 'null'
    UNION ALL
    SELECT 4, employer_4 WHERE employer_4 IS NOT NULL AND employer_4::text <> '{}' AND employer_4::text <> 'null'
  ) sub),
  '[]'::jsonb
);

-- Drop old columns
ALTER TABLE public.applications
  DROP COLUMN employer_1,
  DROP COLUMN employer_2,
  DROP COLUMN employer_3,
  DROP COLUMN employer_4,
  DROP COLUMN additional_employers;
