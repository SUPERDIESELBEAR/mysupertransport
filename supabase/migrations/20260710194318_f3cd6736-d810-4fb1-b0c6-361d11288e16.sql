
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.faq
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Trigger-maintained tsvector (GENERATED requires immutable expression; to_tsvector('english',...) isn't)
CREATE OR REPLACE FUNCTION public.faq_update_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.question,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.answer,'')), 'B') ||
    setweight(to_tsvector('english', array_to_string(coalesce(NEW.tags,'{}'::text[]), ' ')), 'C');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS faq_search_vector_trg ON public.faq;
CREATE TRIGGER faq_search_vector_trg
  BEFORE INSERT OR UPDATE OF question, answer, tags ON public.faq
  FOR EACH ROW EXECUTE FUNCTION public.faq_update_search_vector();

-- Backfill existing rows
UPDATE public.faq
  SET search_vector =
    setweight(to_tsvector('english', coalesce(question,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(answer,'')), 'B') ||
    setweight(to_tsvector('english', array_to_string(coalesce(tags,'{}'::text[]), ' ')), 'C');

CREATE INDEX IF NOT EXISTS faq_search_vector_idx ON public.faq USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS faq_question_trgm_idx ON public.faq USING GIN (question gin_trgm_ops);

ALTER TABLE public.release_notes
  ADD COLUMN IF NOT EXISTS flagged_faq_ids uuid[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.search_staff_faqs(q text)
RETURNS TABLE (
  id uuid,
  question text,
  answer text,
  category public.faq_category,
  tags text[],
  is_published boolean,
  last_verified_at timestamptz,
  rank real,
  headline text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH tsq AS (
    SELECT CASE
      WHEN coalesce(trim(q), '') = '' THEN NULL
      ELSE websearch_to_tsquery('english', q)
    END AS query
  )
  SELECT
    f.id,
    f.question,
    f.answer,
    f.category,
    f.tags,
    f.is_published,
    f.last_verified_at,
    CASE
      WHEN (SELECT query FROM tsq) IS NULL THEN 0::real
      ELSE ts_rank_cd(f.search_vector, (SELECT query FROM tsq))
    END AS rank,
    CASE
      WHEN (SELECT query FROM tsq) IS NULL THEN left(f.answer, 200)
      ELSE ts_headline('english', f.answer, (SELECT query FROM tsq),
        'StartSel=<mark>,StopSel=</mark>,MaxWords=35,MinWords=15,ShortWord=3,MaxFragments=2')
    END AS headline
  FROM public.faq f
  WHERE f.audience = 'staff'
    AND f.is_published = true
    AND (
      (SELECT query FROM tsq) IS NULL
      OR f.search_vector @@ (SELECT query FROM tsq)
      OR f.question % q
    )
  ORDER BY
    rank DESC,
    f.question ASC
  LIMIT 100;
$$;

GRANT EXECUTE ON FUNCTION public.search_staff_faqs(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.flag_faqs_for_reverification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.flagged_faq_ids IS NOT NULL AND array_length(NEW.flagged_faq_ids, 1) > 0 THEN
    UPDATE public.faq
      SET last_verified_at = now() - interval '100 days',
          verified_by = NULL
      WHERE id = ANY(NEW.flagged_faq_ids);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS release_notes_flag_faqs ON public.release_notes;
CREATE TRIGGER release_notes_flag_faqs
  AFTER INSERT OR UPDATE OF flagged_faq_ids ON public.release_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.flag_faqs_for_reverification();
