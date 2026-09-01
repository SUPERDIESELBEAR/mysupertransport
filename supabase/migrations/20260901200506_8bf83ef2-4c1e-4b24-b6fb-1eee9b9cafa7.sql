CREATE OR REPLACE FUNCTION public.set_load_dispatcher(
  p_load_id uuid,
  p_dispatcher_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_prev uuid;
  v_target_user uuid;
  v_prev_label text;
  v_new_label text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'No profile for the current user';
  END IF;

  IF NOT (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner')) THEN
    RAISE EXCEPTION 'Only management or the owner may change the dispatcher on a load';
  END IF;

  SELECT dispatcher_id INTO v_prev FROM public.loads WHERE id = p_load_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Load not found';
  END IF;

  IF p_dispatcher_id IS NOT NULL THEN
    SELECT user_id INTO v_target_user FROM public.profiles WHERE id = p_dispatcher_id;
    IF v_target_user IS NULL THEN
      RAISE EXCEPTION 'That person does not have a profile';
    END IF;
    IF NOT public.has_role(v_target_user, 'dispatcher') THEN
      RAISE EXCEPTION 'That person is not a dispatcher';
    END IF;
  END IF;

  IF v_prev IS NOT DISTINCT FROM p_dispatcher_id THEN
    RETURN p_load_id;
  END IF;

  SELECT NULLIF(TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')), '')
    INTO v_prev_label FROM public.profiles WHERE id = v_prev;
  SELECT NULLIF(TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')), '')
    INTO v_new_label FROM public.profiles WHERE id = p_dispatcher_id;

  UPDATE public.loads
     SET dispatcher_id = p_dispatcher_id,
         updated_by = v_actor,
         updated_at = now()
   WHERE id = p_load_id;

  INSERT INTO public.load_change_history (
    load_id, field_path, previous_value, new_value, is_financial, reason, change_source, changed_by
  ) VALUES (
    p_load_id,
    'dispatcher_id',
    COALESCE(v_prev_label, CASE WHEN v_prev IS NULL THEN NULL ELSE v_prev::text END),
    COALESCE(v_new_label, CASE WHEN p_dispatcher_id IS NULL THEN NULL ELSE p_dispatcher_id::text END),
    false,
    NULLIF(TRIM(COALESCE(p_reason, '')), ''),
    'dispatcher_reassign',
    v_actor
  );

  RETURN p_load_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_load_dispatcher(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_load_dispatcher(uuid, uuid, text) TO authenticated, service_role;