CREATE OR REPLACE FUNCTION public.initiate_owner_transfer(p_to_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_caller uuid := auth.uid();
  v_id uuid;
  v_label text;
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'owner') THEN
    RAISE EXCEPTION 'Only the current owner may initiate an ownership transfer.'
      USING ERRCODE = '42501';
  END IF;

  IF p_to_user_id = v_caller THEN
    RAISE EXCEPTION 'Ownership cannot be transferred to yourself.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_to_user_id) THEN
    RAISE EXCEPTION 'Ownership transfer recipient does not exist.'
      USING ERRCODE = '23503';
  END IF;

  IF NOT public.has_role(p_to_user_id, 'management') THEN
    RAISE EXCEPTION 'Ownership may only be transferred to a user who already holds management.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.owner_transfers
     SET status = 'expired'
   WHERE status = 'pending' AND expires_at <= now();

  IF EXISTS (SELECT 1 FROM public.owner_transfers WHERE status = 'pending') THEN
    RAISE EXCEPTION 'An ownership transfer is already pending; cancel it before starting another.'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.owner_transfers (
    from_user_id, to_user_id, initiated_by, expires_at, status, mechanism
  ) VALUES (
    v_caller, p_to_user_id, v_actor, now() + interval '72 hours', 'pending',
    'in_app_management_transfer'
  )
  RETURNING id INTO v_id;

  SELECT nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '')
    INTO v_label FROM public.profiles p WHERE p.user_id = p_to_user_id;

  INSERT INTO public.audit_log (
    actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata
  ) VALUES (
    v_actor,
    public._audit_actor_name(v_caller),
    'owner_transfer_initiated',
    'owner_transfer',
    v_id,
    coalesce(v_label, p_to_user_id::text),
    jsonb_build_object(
      'mechanism', 'in_app_management_transfer',
      'from_user_id', v_caller,
      'to_user_id', p_to_user_id,
      'expires_at', now() + interval '72 hours'
    )
  );

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_owner_transfer(p_transfer_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_caller uuid := auth.uid();
  v_row public.owner_transfers%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.owner_transfers WHERE id = p_transfer_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ownership transfer not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_caller IS NULL OR v_caller NOT IN (v_row.from_user_id, v_row.to_user_id) THEN
    RAISE EXCEPTION 'Only the sending or receiving party may cancel an ownership transfer.'
      USING ERRCODE = '42501';
  END IF;

  IF v_row.status = 'accepted' THEN
    RAISE EXCEPTION 'This ownership transfer has already been accepted and cannot be cancelled.'
      USING ERRCODE = '22023';
  END IF;

  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'Only a pending ownership transfer can be cancelled.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.owner_transfers
     SET status = 'cancelled', cancelled_at = now(), cancelled_by = v_actor
   WHERE id = p_transfer_id;

  INSERT INTO public.audit_log (
    actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata
  ) VALUES (
    v_actor,
    public._audit_actor_name(v_caller),
    'owner_transfer_cancelled',
    'owner_transfer',
    p_transfer_id,
    p_transfer_id::text,
    jsonb_build_object(
      'mechanism', v_row.mechanism,
      'from_user_id', v_row.from_user_id,
      'to_user_id', v_row.to_user_id,
      'cancelled_by_party', CASE WHEN v_caller = v_row.from_user_id THEN 'owner' ELSE 'recipient' END
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_owner(p_transfer_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_caller uuid := auth.uid();
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

  IF NOT public.has_role(v_row.to_user_id, 'management') THEN
    RAISE EXCEPTION 'The recipient no longer holds management; this ownership transfer cannot be accepted.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = v_row.from_user_id AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'The sending user is no longer the owner; this ownership transfer is stale.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.owner_role_write', 'on', true);

  DELETE FROM public.user_roles
   WHERE user_id = v_row.from_user_id AND role = 'owner';

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_row.to_user_id, 'owner');

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
      'accepted_at', now()
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.initiate_owner_transfer(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_owner_transfer(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.transfer_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.initiate_owner_transfer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_owner_transfer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_owner(uuid) TO authenticated;