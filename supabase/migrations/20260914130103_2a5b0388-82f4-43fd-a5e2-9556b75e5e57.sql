CREATE OR REPLACE FUNCTION public.current_company_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  -- Tenancy is resolved server-side only: no client input, no JWT claim, no
  -- carrier fallback. MEMBERSHIP FIRST (staff), then the caller's OWN operator
  -- row (drivers, who deliberately hold no company_members row because
  -- membership implies staff capability in the billing policies).
  -- An unresolvable caller still gets NULL, which the NOT NULL company_id
  -- columns and the billing RLS predicates both refuse.
  SELECT COALESCE(
    (SELECT cm.company_id FROM public.company_members cm
      WHERE cm.user_id = auth.uid() LIMIT 1),
    (SELECT o.company_id FROM public.operators o
      WHERE o.user_id = auth.uid() LIMIT 1)
  )
$function$;

REVOKE ALL ON FUNCTION public.current_company_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated, service_role;