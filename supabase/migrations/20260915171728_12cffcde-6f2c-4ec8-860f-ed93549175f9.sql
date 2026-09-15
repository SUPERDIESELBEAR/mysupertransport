CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  -- The escape NAMES ITS CASE: service_role (edge functions / cron calling
  -- definer RPCs that gate on this) rather than "whenever the company lookup
  -- returns NULL", which also admitted signed-in users with a role row but no
  -- company_members and no operators row. Same distinction stamp_tenant_company_id
  -- already draws.
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND (auth.role() = 'service_role'
           OR ur.company_id = public.current_company_id())
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role IN ('onboarding_staff', 'dispatcher', 'management', 'owner')
      AND (auth.role() = 'service_role'
           OR ur.company_id = public.current_company_id())
  )
$function$;