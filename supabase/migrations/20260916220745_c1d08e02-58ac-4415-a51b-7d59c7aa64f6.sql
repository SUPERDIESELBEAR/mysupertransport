-- Comment reworded only: the previous comment contained the word "LIMIT",
-- which makes a guard asserting "the body contains no LIMIT" impossible to
-- write honestly. Behaviour is byte-identical to the version applied minutes
-- earlier in this pass.
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  -- Tenancy is resolved server-side only: no client input, no JWT claim, no
  -- carrier fallback. Three sources are read TOGETHER, not in preference order:
  -- company_members (staff), the caller's OWN operator row (drivers, who
  -- deliberately hold no company_members row because membership implies staff
  -- capability in the billing policies), and his TRUCK OWNER row -- read
  -- DIRECTLY, never walked to the operators he owns, so an owner between hires
  -- with no drivers still resolves.
  --
  -- Owner decision C, 2026-09-16: NO ROW-PICKING CLAUSE. Exactly one distinct
  -- non-null company resolves; zero, or two or more, resolve to NULL, which the
  -- NOT NULL company_id columns and the restrictive tenant policies refuse.
  -- (array_agg(...))[1], not min(): there is no min(uuid) in Postgres.
  SELECT CASE WHEN count(*) = 1 THEN (array_agg(d.company_id))[1] END
  FROM (
    SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()
    UNION
    SELECT o.company_id  FROM public.operators o       WHERE o.user_id  = auth.uid()
    UNION
    SELECT t.company_id  FROM public.truck_owners t    WHERE t.user_id  = auth.uid()
  ) d
  WHERE d.company_id IS NOT NULL
$function$;

REVOKE ALL ON FUNCTION public.current_company_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_company_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO service_role;