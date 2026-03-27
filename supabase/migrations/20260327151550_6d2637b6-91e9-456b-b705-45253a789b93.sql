
-- ═══════════════════════════════════════════════════════════════════════════
-- FIX #1: Remove user_id IS NULL from applications SELECT policy
-- Replace with a secure function for draft token lookup
-- ═══════════════════════════════════════════════════════════════════════════

-- Create a SECURITY DEFINER function for draft token lookup
CREATE OR REPLACE FUNCTION public.get_application_by_draft_token(p_token uuid)
RETURNS SETOF applications
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.applications
  WHERE draft_token = p_token::text
    AND is_draft = true
  LIMIT 1;
$$;

-- Drop the insecure SELECT policy
DROP POLICY IF EXISTS "Owner can view own application" ON public.applications;

-- Recreate it without the user_id IS NULL clause
CREATE POLICY "Owner can view own application"
ON public.applications
FOR SELECT
TO public
USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- FIX #2: Restrict operator UPDATE on onboarding_status to only decal columns
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Operators can update their own decal photos" ON public.onboarding_status;

CREATE POLICY "Operators can update their own decal photos"
ON public.onboarding_status
FOR UPDATE
TO public
USING (
  EXISTS (
    SELECT 1 FROM operators
    WHERE operators.id = onboarding_status.operator_id
      AND operators.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM operators
    WHERE operators.id = onboarding_status.operator_id
      AND operators.user_id = auth.uid()
  )
);

-- Restrict to only the columns operators should update
REVOKE UPDATE ON public.onboarding_status FROM authenticated;
GRANT UPDATE (decal_photo_ds_url, decal_photo_ps_url) ON public.onboarding_status TO authenticated;
-- Re-grant full UPDATE to service_role (used by edge functions and triggers)
GRANT UPDATE ON public.onboarding_status TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- FIX #3: Harden user_roles INSERT — move to SECURITY DEFINER function
-- ═══════════════════════════════════════════════════════════════════════════

-- Create a secure function for assigning roles
CREATE OR REPLACE FUNCTION public.assign_user_role(p_user_id uuid, p_role app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is management
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'management'
  ) THEN
    RAISE EXCEPTION 'Only management users can assign roles';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, p_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

-- Create a secure function for removing roles
CREATE OR REPLACE FUNCTION public.remove_user_role(p_user_id uuid, p_role app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'management'
  ) THEN
    RAISE EXCEPTION 'Only management users can remove roles';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = p_user_id AND role = p_role;
END;
$$;

-- Drop the direct INSERT policy (role assignment now goes through the function)
DROP POLICY IF EXISTS "Management can insert roles" ON public.user_roles;
-- Drop the direct DELETE policy (role removal now goes through the function)  
DROP POLICY IF EXISTS "Management can delete roles" ON public.user_roles;
