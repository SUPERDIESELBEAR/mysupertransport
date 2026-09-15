-- 1. assign_user_role: refuse a staff role for a subject who is not a member of
--    the caller's company. Chosen over minting membership here: this RPC grants a
--    role to an EXISTING user, and membership is not something an app RPC asserts
--    (company_members has no user-writable policy by design). The invite path is
--    what creates membership.
CREATE OR REPLACE FUNCTION public.assign_user_role(p_user_id uuid, p_role app_role)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_company uuid := public.current_company_id();
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

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Cannot resolve your company; a role cannot be granted.'
      USING ERRCODE = '42501';
  END IF;

  -- Staff roles only. An operator holds no company_members row by design and
  -- resolves his company through his operator record instead.
  IF p_role IN ('management', 'dispatcher', 'onboarding_staff')
     AND NOT EXISTS (
       SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = p_user_id AND cm.company_id = v_company
     ) THEN
    RAISE EXCEPTION 'That person is not a member of your company, so a staff role would work for no company. Invite them as staff instead.'
      USING ERRCODE = '42501',
            HINT = 'company_members row required before granting management, dispatcher or onboarding_staff.';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, p_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$function$;

-- 2. bootstrap_assign_owner: seed the owner's membership alongside the role.
--    Without it the first owner resolves NULL and, since the escape now names
--    service_role only, his own role passes for no company.
CREATE OR REPLACE FUNCTION public.bootstrap_assign_owner(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_label text;
  -- Bare scalar subquery: raises 21000 rather than picking a carrier once a
  -- second company exists. At that point this tool must be told which one.
  v_company uuid := (SELECT id FROM public.carrier_profile);
BEGIN
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'No company exists; an owner cannot be bootstrapped.'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE role = 'owner' AND company_id = v_company
  ) THEN
    RAISE EXCEPTION 'An owner already exists for this company; bootstrap cannot assign another owner.'
      USING ERRCODE = '23505';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Bootstrap owner target does not exist.'
      USING ERRCODE = '23503';
  END IF;

  PERFORM set_config('app.owner_role_write', 'on', true);

  INSERT INTO public.user_roles (user_id, role, company_id)
  VALUES (p_user_id, 'owner', v_company);

  INSERT INTO public.company_members (user_id, company_id)
  VALUES (p_user_id, v_company)
  ON CONFLICT (user_id, company_id) DO NOTHING;

  SELECT nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '')
    INTO v_label
    FROM public.profiles p
   WHERE p.user_id = p_user_id;

  INSERT INTO public.audit_log (
    actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata
  ) VALUES (
    NULL,
    'bootstrap-admin',
    'bootstrap_owner_assigned',
    'user',
    p_user_id,
    coalesce(v_label, p_user_id::text),
    jsonb_build_object('mechanism', 'bootstrap_assign_owner', 'company_id', v_company)
  );
END;
$function$;