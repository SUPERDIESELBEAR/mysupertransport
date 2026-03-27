-- Update is_staff to include owner
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id 
    AND role IN ('onboarding_staff', 'dispatcher', 'management', 'owner')
  )
$$;

-- Update assign_user_role to block owner assignment
CREATE OR REPLACE FUNCTION public.assign_user_role(p_user_id uuid, p_role app_role)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  IF p_role = 'owner' THEN
    RAISE EXCEPTION 'The owner role cannot be assigned through the application';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('management', 'owner')
  ) THEN
    RAISE EXCEPTION 'Only management users can assign roles';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, p_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

-- Update remove_user_role to block owner removal
CREATE OR REPLACE FUNCTION public.remove_user_role(p_user_id uuid, p_role app_role)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  IF p_role = 'owner' THEN
    RAISE EXCEPTION 'The owner role cannot be removed through the application';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('management', 'owner')
  ) THEN
    RAISE EXCEPTION 'Only management users can remove roles';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = p_user_id AND role = p_role;
END;
$$;

-- Allow owner to view all roles
DROP POLICY IF EXISTS "Owner can view all roles" ON public.user_roles;
CREATE POLICY "Owner can view all roles"
  ON public.user_roles
  FOR SELECT
  TO public
  USING (has_role(auth.uid(), 'owner'));