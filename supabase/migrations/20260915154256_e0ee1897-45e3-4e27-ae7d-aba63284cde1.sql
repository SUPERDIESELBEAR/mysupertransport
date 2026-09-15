-- SECURITY FINDING has_role_not_company_scoped (CROSS_TENANT_DATA_EXPOSURE).
-- has_role()/is_staff() ignored user_roles.company_id, so every staff-role RLS
-- policy that lacked its own company predicate (settlements, deductions,
-- brokers, loads, claim_flags, pay policies, ...) granted access to EVERY
-- carrier's rows. Scoping the two functions closes all of them at once instead
-- of patching ~40 policies individually and missing one.
--
-- The `current_company_id() IS NULL` escape is deliberate and narrow: it covers
-- callers with no signed-in identity — service-role edge functions and cron,
-- which already bypass RLS entirely — and unauthenticated callers, who hold no
-- user_roles rows at all, so it grants nothing new. An authenticated caller
-- ALWAYS resolves a company (membership, else his own operator row), so no
-- staff or driver path reaches the escape.
--
-- Pre-checked on live data: 0 role rows with a NULL company, 0 staff rows whose
-- role company differs from their membership company, 0 operator rows whose
-- role company differs from their operator company. Behaviour-preserving today.

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role IN ('onboarding_staff', 'dispatcher', 'management', 'owner')
      AND (public.current_company_id() IS NULL
           OR ur.company_id = public.current_company_id())
  )
$function$;