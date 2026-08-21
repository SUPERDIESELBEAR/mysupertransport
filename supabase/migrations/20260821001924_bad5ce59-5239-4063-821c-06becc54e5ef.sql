CREATE OR REPLACE FUNCTION public.record_duplicate_broker_reference(
  p_new_load_id uuid,
  p_existing_load_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile uuid;
  v_new_number text;
  v_existing_number text;
  v_reference text;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'dispatcher')
    OR public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
  ) THEN
    RAISE EXCEPTION 'Not authorized to record a duplicate broker reference.';
  END IF;

  IF p_new_load_id IS NULL OR p_existing_load_id IS NULL OR p_new_load_id = p_existing_load_id THEN
    RAISE EXCEPTION 'Two different loads are required to record a duplicate.';
  END IF;

  IF coalesce(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required when creating a duplicate broker reference.';
  END IF;

  v_profile := public.current_profile_id();

  SELECT load_number, broker_reference_number INTO v_new_number, v_reference
    FROM public.loads WHERE id = p_new_load_id;
  SELECT load_number INTO v_existing_number
    FROM public.loads WHERE id = p_existing_load_id;

  IF v_new_number IS NULL OR v_existing_number IS NULL THEN
    RAISE EXCEPTION 'One of the loads no longer exists.';
  END IF;

  -- The new load's side of the story.
  INSERT INTO public.load_change_history (
    load_id, field_path, previous_value, new_value, is_financial, reason, change_source, changed_by
  ) VALUES (
    p_new_load_id,
    'duplicate_broker_reference',
    'Existing load ' || v_existing_number || ' (' || p_existing_load_id || ')',
    'Created anyway with broker reference ' || coalesce(v_reference, '—'),
    false,
    btrim(p_reason),
    'duplicate_override',
    v_profile
  );

  -- The original load's side of the same event.
  INSERT INTO public.load_change_history (
    load_id, field_path, previous_value, new_value, is_financial, reason, change_source, changed_by
  ) VALUES (
    p_existing_load_id,
    'duplicate_created_against_this_load',
    'Broker reference ' || coalesce(v_reference, '—'),
    'Duplicate load ' || v_new_number || ' (' || p_new_load_id || ') was created anyway',
    false,
    btrim(p_reason),
    'duplicate_override',
    v_profile
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_duplicate_broker_reference(uuid, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_duplicate_broker_reference(uuid, uuid, text) TO authenticated;