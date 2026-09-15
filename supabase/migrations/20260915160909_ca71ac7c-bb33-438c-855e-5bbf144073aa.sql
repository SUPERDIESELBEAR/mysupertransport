-- Re-author both role helpers with the project-standard pinned search_path
-- (public, extensions). Behaviour is unchanged: a role row only counts when it
-- belongs to the caller's own company. The NULL branch is for unauthenticated
-- and service-role contexts, which hold no user_roles rows and bypass RLS.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
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

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role IN ('onboarding_staff', 'dispatcher', 'management', 'owner')
      AND (public.current_company_id() IS NULL
           OR ur.company_id = public.current_company_id())
  )
$function$;