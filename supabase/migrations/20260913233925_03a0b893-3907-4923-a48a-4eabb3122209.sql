-- The rebuilt user_roles_single_owner index is PER-COMPANY. Two functions
-- still read "is there an owner" globally; that would refuse the second
-- company an owner even though the index now permits one.

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

REVOKE ALL ON FUNCTION public.bootstrap_assign_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bootstrap_assign_owner(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.bootstrap_assign_owner(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_assign_owner(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.transfer_owner(p_transfer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_caller uuid := auth.uid();
  v_company uuid := public.current_company_id();
  v_row public.owner_transfers%ROWTYPE;
  v_label text;
BEGIN
  SELECT * INTO v_row FROM public.owner_transfers WHERE id = p_transfer_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ownership transfer not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status = 'cancelled' THEN
    RAISE EXCEPTION 'This ownership transfer was cancelled and cannot be accepted.'
      USING ERRCODE = '22023';
  END IF;

  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'Only a pending ownership transfer can be accepted.'
      USING ERRCODE = '22023';
  END IF;

  IF v_row.expires_at <= now() THEN
    RAISE EXCEPTION 'This ownership transfer has expired.'
      USING ERRCODE = '22023';
  END IF;

  IF v_caller IS NULL OR v_caller <> v_row.to_user_id THEN
    RAISE EXCEPTION 'Only the named recipient may accept this ownership transfer.'
      USING ERRCODE = '42501';
  END IF;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'The recipient holds no company membership; this ownership transfer cannot be accepted.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_role(v_row.to_user_id, 'management') THEN
    RAISE EXCEPTION 'The recipient no longer holds management; this ownership transfer cannot be accepted.'
      USING ERRCODE = '42501';
  END IF;

  -- Scoped to the recipient's company: ownership is per company now.
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = v_row.from_user_id
       AND role = 'owner'
       AND company_id = v_company
  ) THEN
    RAISE EXCEPTION 'The sending user is no longer the owner; this ownership transfer is stale.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.owner_role_write', 'on', true);

  DELETE FROM public.user_roles
   WHERE user_id = v_row.from_user_id
     AND role = 'owner'
     AND company_id = v_company;

  INSERT INTO public.user_roles (user_id, role, company_id)
  VALUES (v_row.to_user_id, 'owner', v_company);

  UPDATE public.owner_transfers
     SET status = 'accepted', accepted_at = now(), accepted_by = v_actor
   WHERE id = p_transfer_id;

  SELECT nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '')
    INTO v_label FROM public.profiles p WHERE p.user_id = v_row.to_user_id;

  INSERT INTO public.audit_log (
    actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata
  ) VALUES (
    v_actor,
    public._audit_actor_name(v_caller),
    'owner_transferred',
    'owner_transfer',
    p_transfer_id,
    coalesce(v_label, v_row.to_user_id::text),
    jsonb_build_object(
      'mechanism', v_row.mechanism,
      'from_user_id', v_row.from_user_id,
      'to_user_id', v_row.to_user_id,
      'company_id', v_company,
      'accepted_at', now()
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.transfer_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transfer_owner(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.transfer_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_owner(uuid) TO service_role;