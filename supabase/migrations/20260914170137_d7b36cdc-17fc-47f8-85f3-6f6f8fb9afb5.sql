-- Fix: unit_number_pool() built a TEMP TABLE inside a STABLE function, which
-- Postgres refuses outright ("CREATE TABLE is not allowed in a non-volatile
-- function"). Same rules, same output shape, same volatility — the scratch
-- table is replaced by CTEs so the whole thing is one read.

CREATE OR REPLACE FUNCTION public.unit_number_pool()
RETURNS TABLE (
  unit integer,
  kind text,
  freed_at timestamptz,
  note text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_company uuid := public.current_company_id();
  v_min integer;
  v_max_offered integer;
  v_excluded text[];
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'onboarding_staff')
    OR public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
  ) THEN
    RAISE EXCEPTION 'Only onboarding staff and management may read the unit number pool.'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.sequence_min, c.sequence_max_offered, c.excluded_units
    INTO v_min, v_max_offered, v_excluded
  FROM public.unit_number_config c
  WHERE c.company_id = v_company;

  IF v_min IS NULL THEN
    RAISE EXCEPTION 'No unit number configuration exists for this company.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH holders AS (
    SELECT
      public.operator_unit_number(s.unit_number, o.unit_number) AS u,
      o.is_active,
      o.deactivated_at,
      s.go_live_date
    FROM public.operators o
    LEFT JOIN public.onboarding_status s ON s.operator_id = o.id
    WHERE o.company_id = v_company
      AND COALESCE(o.is_demo, false) = false
  ), numbered AS (
    SELECT (h.u)::integer AS n, h.is_active, h.deactivated_at, h.go_live_date
    FROM holders h
    WHERE h.u ~ '^[0-9]+$'
      AND NOT (h.u = ANY (v_excluded))
  ), grouped AS (
    SELECT
      n.n AS n,
      -- Taken: went live at all, or still on the roster, or onboarding is open.
      -- A number held by more than one operator counts as taken if ANY holder
      -- went live or is still on the roster — the live holder always wins.
      bool_or(n.go_live_date IS NOT NULL OR COALESCE(n.is_active, false)) AS taken,
      -- Freed: the oldest wash-out that gave this number up.
      min(n.deactivated_at) FILTER (
        WHERE n.go_live_date IS NULL AND NOT COALESCE(n.is_active, false)
      ) AS freed_at
    FROM numbered n
    GROUP BY n.n
  ), ceiling AS (
    SELECT GREATEST(COALESCE(max(g.n), v_min - 1), v_min - 1) AS c FROM grouped g
  ), pool AS (
    -- Recycled: freed by a pre-Go-Live wash-out and held by nobody live.
    SELECT g.n AS unit, 'recycled'::text AS kind, g.freed_at AS freed_at,
           'Freed by a driver who never reached Go-Live'::text AS note
    FROM grouped g
    WHERE NOT g.taken
    UNION ALL
    -- Gaps: inside the sequence and never issued.
    SELECT gs.i, 'gap'::text, NULL::timestamptz, 'Never issued'::text
    FROM ceiling cl, generate_series(v_min, cl.c) gs(i)
    WHERE NOT EXISTS (SELECT 1 FROM grouped g WHERE g.n = gs.i)
      AND NOT (gs.i::text = ANY (v_excluded))
    UNION ALL
    -- Next in sequence.
    SELECT cl.c + 1, 'next'::text, NULL::timestamptz, 'Next in sequence'::text
    FROM ceiling cl
    WHERE cl.c + 1 <= v_max_offered
  )
  SELECT q.unit, q.kind, q.freed_at, q.note
  FROM pool q
  -- Offer order is a rule, not an accident: recycled, then gaps, then next.
  ORDER BY CASE q.kind WHEN 'recycled' THEN 0 WHEN 'gap' THEN 1 ELSE 2 END,
           q.freed_at ASC NULLS LAST,
           q.unit ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.unit_number_pool() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unit_number_pool() TO authenticated, service_role;