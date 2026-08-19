CREATE OR REPLACE FUNCTION public.get_staff_contact_info(_user_ids uuid[])
RETURNS TABLE(user_id uuid, first_name text, last_name text, avatar_url text, primary_role app_role)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (public.is_staff(auth.uid()) OR public.has_role(auth.uid(), 'operator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
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
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.assign_user_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.remove_user_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.search_audit_log(text, text, timestamptz, timestamptz, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.search_audit_log(text, text, timestamptz, timestamptz, integer, integer, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_staff_contact_info(uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_pei_queue() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_go_live_with_override(uuid, date, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.assign_user_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_user_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_audit_log(text, text, timestamptz, timestamptz, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_audit_log(text, text, timestamptz, timestamptz, integer, integer, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_contact_info(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pei_queue() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_go_live_with_override(uuid, date, text) TO authenticated;

ALTER FUNCTION public._app_correction_editable_columns() SET search_path = public;