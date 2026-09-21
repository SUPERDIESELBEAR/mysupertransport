-- Rollover read fix: one row per eligible operator, however old the log.
-- The edge function previously read dispatch_daily_log directly, which PostgREST
-- caps at 1,000 rows, so only the most recently logged operators were ever seen.
-- DISTINCT ON collapses to the latest log per operator inside the database, so the
-- result size is bounded by the number of operators, not by the age of the table.
CREATE OR REPLACE FUNCTION public.latest_dispatch_log_per_operator(p_today date)
RETURNS TABLE (
  operator_id uuid,
  status public.daily_dispatch_status,
  log_date date,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT ON (l.operator_id)
    l.operator_id,
    l.status,
    l.log_date,
    l.created_at
  FROM public.dispatch_daily_log l
  JOIN public.operators o ON o.id = l.operator_id
  WHERE l.log_date <= p_today
    -- exactly the rules the edge function applied before, unchanged:
    AND COALESCE(o.excluded_from_dispatch, false) = false  -- administrative hide
    AND COALESCE(o.is_parked, false) = false               -- parked: never rolled forward
  ORDER BY l.operator_id, l.log_date DESC, l.created_at DESC
$$;

REVOKE ALL ON FUNCTION public.latest_dispatch_log_per_operator(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.latest_dispatch_log_per_operator(date) FROM anon;
REVOKE ALL ON FUNCTION public.latest_dispatch_log_per_operator(date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.latest_dispatch_log_per_operator(date) TO service_role;

COMMENT ON FUNCTION public.latest_dispatch_log_per_operator(date) IS
  'Latest dispatch_daily_log row per eligible operator (excludes excluded_from_dispatch and is_parked). Called by the rollover-dispatch-status edge function with the service role; SECURITY INVOKER so no RLS is bypassed.';

-- Undo:
--   DROP FUNCTION public.latest_dispatch_log_per_operator(date);
