CREATE OR REPLACE FUNCTION public.update_load_status(
  p_load_id uuid,
  p_new_status load_status,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_current load_status;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_seq load_status[] := ARRAY[
    'available','covered','dispatched','in_transit','at_delivery','delivered',
    'pod_received','accessorials_approved','ready_to_invoice','invoiced',
    'factored','paid','settled','closed'
  ]::load_status[];
  v_billing load_status[] := ARRAY['invoiced','factored','paid','settled']::load_status[];
  v_is_mgmt boolean;
  v_is_disp boolean;
  v_from int;
  v_to int;
  v_requires_note boolean := false;
  v_hist_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_is_mgmt := public.has_role(v_uid, 'management') OR public.has_role(v_uid, 'owner');
  v_is_disp := public.has_role(v_uid, 'dispatcher');

  IF NOT (v_is_mgmt OR v_is_disp) THEN
    RAISE EXCEPTION 'You do not have permission to change load status';
  END IF;

  IF p_new_status = ANY(v_billing) AND NOT v_is_mgmt THEN
    RAISE EXCEPTION 'Billing status changes require management access';
  END IF;

  SELECT status INTO v_current FROM public.loads WHERE id = p_load_id;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'Load not found';
  END IF;

  IF v_current = p_new_status THEN
    RAISE EXCEPTION 'Load is already in that status';
  END IF;

  v_from := array_position(v_seq, v_current);
  v_to := array_position(v_seq, p_new_status);

  IF p_new_status IN ('tonu','cancelled') THEN
    v_requires_note := true;
  ELSIF p_new_status IN ('paid','settled') THEN
    v_requires_note := true;
  ELSIF v_from IS NULL OR v_to IS NULL THEN
    v_requires_note := true;
  ELSIF v_to < v_from THEN
    v_requires_note := true;
  ELSIF v_to > v_from + 1
        AND NOT (v_current = 'invoiced' AND p_new_status = 'paid') THEN
    v_requires_note := true;
  END IF;

  IF v_requires_note AND v_note IS NULL THEN
    RAISE EXCEPTION 'A note is required for this status change';
  END IF;

  UPDATE public.loads SET status = p_new_status WHERE id = p_load_id;

  SELECT id INTO v_hist_id
  FROM public.load_status_history
  WHERE load_id = p_load_id
  ORDER BY changed_at DESC, created_at DESC
  LIMIT 1;

  IF v_hist_id IS NOT NULL THEN
    UPDATE public.load_status_history
    SET notes = v_note,
        change_source = 'manual_ui',
        changed_by = coalesce(changed_by, public.current_profile_id())
    WHERE id = v_hist_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_load_status(uuid, load_status, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_load_status(uuid, load_status, text) TO authenticated;