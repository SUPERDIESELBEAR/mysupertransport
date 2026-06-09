
CREATE OR REPLACE FUNCTION public.log_ica_event(
  p_action text,
  p_operator_id uuid,
  p_contract_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_action NOT IN ('ica_screen_opened','ica_execute_clicked','ica_upload_failed','ica_signed') THEN
    RAISE EXCEPTION 'invalid_action: %', p_action;
  END IF;

  SELECT user_id INTO v_owner FROM public.operators WHERE id = p_operator_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'operator_not_found';
  END IF;

  IF v_owner <> v_uid AND NOT public.is_staff(v_uid) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT NULLIF(trim(concat_ws(' ', first_name, last_name)), '')
  INTO v_name
  FROM public.profiles WHERE user_id = v_uid;

  INSERT INTO public.audit_log (entity_type, entity_id, entity_label, action, actor_id, actor_name, metadata)
  VALUES (
    'ica_contract',
    p_operator_id,
    COALESCE(v_name, 'Operator'),
    p_action,
    v_uid,
    COALESCE(v_name, 'Operator'),
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('contract_id', p_contract_id, 'operator_id', p_operator_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_ica_event(text, uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_ica_event(text, uuid, uuid, jsonb) TO authenticated;
