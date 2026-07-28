CREATE OR REPLACE FUNCTION public.get_staff_contact_info(_user_ids uuid[])
RETURNS TABLE (
  user_id uuid,
  first_name text,
  last_name text,
  avatar_url text,
  primary_role app_role
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.user_id,
    p.first_name,
    p.last_name,
    p.avatar_url,
    (
      SELECT ur.role
      FROM public.user_roles ur
      WHERE ur.user_id = p.user_id
        AND ur.role IN ('owner','management','onboarding_staff','dispatcher')
      ORDER BY CASE ur.role
        WHEN 'owner' THEN 1
        WHEN 'management' THEN 2
        WHEN 'onboarding_staff' THEN 3
        WHEN 'dispatcher' THEN 4
        ELSE 5
      END
      LIMIT 1
    ) AS primary_role
  FROM public.profiles p
  WHERE p.user_id = ANY(_user_ids)
    AND public.is_staff(p.user_id);
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_contact_info(uuid[]) TO authenticated;