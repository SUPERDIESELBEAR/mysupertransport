DROP FUNCTION IF EXISTS public.compliance_status(integer, integer);
DROP FUNCTION IF EXISTS public.eld_cron_status();
DROP FUNCTION IF EXISTS public.get_pei_requests_needing_action();
DROP FUNCTION IF EXISTS public.get_application_pei_summary(uuid);

-- Repin the two kept role writers to the documented `public, extensions`.
-- Bodies copied verbatim from pg_get_functiondef; only the pin changes.
CREATE OR REPLACE FUNCTION public.assign_user_role(p_user_id uuid, p_role app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.remove_user_role(p_user_id uuid, p_role app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
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
$function$;

REVOKE EXECUTE ON FUNCTION public.assign_user_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_user_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_user_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_user_role(uuid, app_role) TO authenticated;

COMMENT ON FUNCTION public.assign_user_role(uuid, app_role) IS
  'Client-side role writer. Refuses the owner role and requires a management/owner caller. Currently uncalled: live role assignment runs through service_role edge functions (invite-staff, invite-operator, invite-truck-owner, get-staff-list, bootstrap-admin), which bypass this refusal.';
COMMENT ON FUNCTION public.remove_user_role(uuid, app_role) IS
  'Client-side role writer. Refuses removing the owner role and requires a management/owner caller. Currently uncalled: live role removal runs through service_role edge functions (get-staff-list, delete-user-account), which bypass this refusal.';