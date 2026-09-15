-- Same body as the 2026-09-15 carrier-scoping fix. Re-stated with the fully
-- qualified argument type (public.app_role) so the repo scanner matches this
-- definition to the signature it tracks, instead of the 2026-03-07 original.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND (public.current_company_id() IS NULL
           OR ur.company_id = public.current_company_id())
  )
$function$;