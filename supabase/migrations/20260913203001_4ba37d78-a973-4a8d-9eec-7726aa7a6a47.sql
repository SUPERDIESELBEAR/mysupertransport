-- 1. Membership table. carrier_profile.id is the company identity.
CREATE TABLE public.company_members (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.carrier_profile(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  UNIQUE (user_id, company_id)
);

CREATE INDEX idx_company_members_user ON public.company_members(user_id);
CREATE INDEX idx_company_members_company ON public.company_members(company_id);

-- Grants: read-only for authenticated (own row), full for service_role.
GRANT SELECT ON public.company_members TO authenticated;
GRANT ALL ON public.company_members TO service_role;

ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

-- Read own membership only. NO user-writable policy: membership is not a user assertion.
CREATE POLICY "company_members read own row"
  ON public.company_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER update_company_members_updated_at
  BEFORE UPDATE ON public.company_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Membership rows, written BEFORE the resolver loses its fallback,
--    in this same migration/transaction. Owner + every active non-operator
--    staff user (the roles the billing policies admit).
INSERT INTO public.company_members (user_id, company_id)
SELECT DISTINCT ur.user_id, (SELECT id FROM public.carrier_profile ORDER BY created_at LIMIT 1)
FROM public.user_roles ur
JOIN public.profiles p ON p.user_id = ur.user_id
WHERE ur.role IN ('owner','management','onboarding_staff','dispatcher')
  AND p.account_status = 'active'
ON CONFLICT (user_id, company_id) DO NOTHING;

-- 3. Resolver rewrite: per-user, fail closed, no fallback.
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  -- Tenancy is resolved from server-side membership only. No client input,
  -- no JWT claim, no COALESCE fallback: an unresolvable caller gets NULL,
  -- which the NOT NULL company_id columns and the billing RLS predicates
  -- both refuse.
  SELECT cm.company_id
  FROM public.company_members cm
  WHERE cm.user_id = auth.uid()
  LIMIT 1
$function$;

REVOKE ALL ON FUNCTION public.current_company_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated, service_role;