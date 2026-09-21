-- Owner decision 2026-09-21: the nightly rollover must never write a board status for a
-- driver who is not active. Adds two rules to the eligibility set; every other rule is
-- unchanged (log_date <= p_today, excluded_from_dispatch, is_parked, latest row wins).
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
    AND COALESCE(o.excluded_from_dispatch, false) = false  -- administrative hide
    AND COALESCE(o.is_parked, false) = false               -- parked: never rolled forward
    AND o.is_active = true                                 -- owner decision 2026-09-21
    AND o.deactivated_at IS NULL                           -- owner decision 2026-09-21
  ORDER BY l.operator_id, l.log_date DESC, l.created_at DESC
$$;

REVOKE ALL ON FUNCTION public.latest_dispatch_log_per_operator(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.latest_dispatch_log_per_operator(date) FROM anon;
REVOKE ALL ON FUNCTION public.latest_dispatch_log_per_operator(date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.latest_dispatch_log_per_operator(date) TO service_role;

COMMENT ON FUNCTION public.latest_dispatch_log_per_operator(date) IS
  'Latest dispatch_daily_log row per eligible operator: excludes excluded_from_dispatch, is_parked, and (owner decision 2026-09-21) any operator that is not is_active or has deactivated_at set. Called by the rollover-dispatch-status edge function with the service role; SECURITY INVOKER so no RLS is bypassed.';

-- Undo (restores the 0014 definition, without the two active-driver rules):
--   CREATE OR REPLACE FUNCTION public.latest_dispatch_log_per_operator(p_today date)
--   RETURNS TABLE (operator_id uuid, status public.daily_dispatch_status, log_date date, created_at timestamptz)
--   LANGUAGE sql STABLE SET search_path = public AS $$
--     SELECT DISTINCT ON (l.operator_id) l.operator_id, l.status, l.log_date, l.created_at
--     FROM public.dispatch_daily_log l JOIN public.operators o ON o.id = l.operator_id
--     WHERE l.log_date <= p_today
--       AND COALESCE(o.excluded_from_dispatch, false) = false
--       AND COALESCE(o.is_parked, false) = false
--     ORDER BY l.operator_id, l.log_date DESC, l.created_at DESC $$;
