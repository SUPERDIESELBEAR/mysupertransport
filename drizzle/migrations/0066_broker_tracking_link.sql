-- 0066 — Broker tracking link (P52 / P64).
-- Reuses share_tokens + _share_token_gate under the new scope 'load_tracking'
-- (resource_id = load id, one row per load via share_tokens_scope_resource_unique).
-- No new table. The gate, its logging and its 60/hour limit are unchanged.
--
-- UNDO: DROP FUNCTION public.resolve_load_tracking_link(uuid);
--       DROP FUNCTION public.revoke_load_tracking_link(uuid);
--       DROP FUNCTION public.get_or_create_load_tracking_link(uuid);
--       DROP FUNCTION public._load_tracking_assert_staff(uuid);
--       DELETE FROM public.share_tokens WHERE scope = 'load_tracking';

-- Shared caller + company check. Definer functions bypass RLS, so the check
-- lives here, not in policies (the get_pei_queue lesson).
CREATE OR REPLACE FUNCTION public._load_tracking_assert_staff(p_load_id uuid)
RETURNS public.loads
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_load public.loads%ROWTYPE;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT (
       public.has_role(v_uid, 'dispatcher'::app_role)
    OR public.has_role(v_uid, 'management'::app_role)
    OR public.has_role(v_uid, 'owner'::app_role)
  ) THEN
    RAISE EXCEPTION 'You do not have permission to manage tracking links.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_load FROM public.loads l WHERE l.id = p_load_id;
  IF NOT FOUND OR v_load.company_id IS DISTINCT FROM public.current_company_id() THEN
    RAISE EXCEPTION 'Load not found.' USING ERRCODE = '42501';
  END IF;
  RETURN v_load;
END;
$$;
REVOKE ALL ON FUNCTION public._load_tracking_assert_staff(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_or_create_load_tracking_link(p_load_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_load public.loads%ROWTYPE;
  v_tok public.share_tokens%ROWTYPE;
  v_new uuid;
BEGIN
  v_load := public._load_tracking_assert_staff(p_load_id);

  IF v_load.status IN ('cancelled', 'tonu') THEN
    RAISE EXCEPTION 'Tracking is off for cancelled loads.' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_tok FROM public.share_tokens t
  WHERE t.scope = 'load_tracking' AND t.resource_id = p_load_id
  FOR UPDATE;

  IF FOUND AND v_tok.revoked_at IS NULL THEN
    RETURN v_tok.token;
  END IF;

  v_new := gen_random_uuid();
  IF FOUND THEN
    -- Revoked: issue a NEW token. The old token no longer exists in
    -- share_tokens, so the gate returns not_found for it forever; the
    -- access log keeps its history (no FK, rows untouched).
    UPDATE public.share_tokens
       SET token = v_new, revoked_at = NULL, created_by = auth.uid(), created_at = now()
     WHERE token = v_tok.token;
  ELSE
    INSERT INTO public.share_tokens (token, scope, resource_id, created_by, company_id)
    VALUES (v_new, 'load_tracking', p_load_id, auth.uid(), v_load.company_id);
  END IF;
  RETURN v_new;
END;
$$;
REVOKE ALL ON FUNCTION public.get_or_create_load_tracking_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_load_tracking_link(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_load_tracking_link(p_load_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM public._load_tracking_assert_staff(p_load_id);
  UPDATE public.share_tokens
     SET revoked_at = now()
   WHERE scope = 'load_tracking' AND resource_id = p_load_id AND revoked_at IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_load_tracking_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_load_tracking_link(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_load_tracking_link(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_gate record;
  v_load public.loads%ROWTYPE;
  v_carrier public.carrier_profile%ROWTYPE;
  v_delivered timestamptz;
  v_at_pickup boolean;
  v_label text;
  v_last timestamptz;
  v_stops jsonb;
BEGIN
  SELECT g.outcome, g.scope, g.resource_id INTO v_gate FROM public._share_token_gate(p_token) g;

  IF v_gate.outcome = 'throttled' THEN
    RETURN jsonb_build_object('outcome', 'throttled');
  END IF;
  IF v_gate.outcome IS DISTINCT FROM 'ok' OR v_gate.scope IS DISTINCT FROM 'load_tracking' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_load FROM public.loads l WHERE l.id = v_gate.resource_id;
  IF NOT FOUND OR v_load.status IN ('cancelled', 'tonu') THEN
    RETURN NULL;
  END IF;

  v_delivered := COALESCE(v_load.delivered_at, (
    SELECT min(h.changed_at) FROM public.load_status_history h
    WHERE h.load_id = v_load.id AND h.new_status = 'delivered'));
  IF v_delivered IS NOT NULL AND v_delivered < now() - interval '7 days' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_carrier FROM public.carrier_profile c WHERE c.id = v_load.company_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.load_stops s
    WHERE s.load_id = v_load.id AND s.stop_type IN ('pickup', 'drop_and_hook')
      AND s.actual_arrival_at IS NOT NULL AND s.actual_departure_at IS NULL
  ) INTO v_at_pickup;

  v_label := CASE
    WHEN v_load.status IN ('available', 'covered') THEN 'Scheduled'
    WHEN v_load.status IN ('dispatched', 'in_transit') AND v_at_pickup THEN 'At pickup'
    WHEN v_load.status = 'dispatched' THEN 'Dispatched'
    WHEN v_load.status = 'in_transit' THEN 'In transit'
    WHEN v_load.status = 'at_delivery' THEN 'At delivery'
    ELSE 'Delivered'
  END;

  SELECT GREATEST(
    (SELECT max(GREATEST(s.actual_arrival_at, s.actual_departure_at))
       FROM public.load_stops s WHERE s.load_id = v_load.id),
    (SELECT max(h.changed_at) FROM public.load_status_history h
      WHERE h.load_id = v_load.id
        AND h.new_status IN ('available','covered','dispatched','in_transit','at_delivery','delivered'))
  ) INTO v_last;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'sequence', s.stop_sequence,
      'type', CASE s.stop_type WHEN 'pickup' THEN 'Pickup' WHEN 'delivery' THEN 'Delivery' ELSE 'Drop & hook' END,
      'facility_name', s.facility_name,
      'city', s.city,
      'state', s.state,
      'appointment_start', s.appointment_start,
      'appointment_end', s.appointment_end,
      'arrived_at', s.actual_arrival_at,
      'departed_at', s.actual_departure_at
    ) ORDER BY s.stop_sequence), '[]'::jsonb)
  INTO v_stops FROM public.load_stops s WHERE s.load_id = v_load.id;

  RETURN jsonb_build_object(
    'outcome', 'ok',
    'carrier', jsonb_build_object(
      'legal_name', v_carrier.legal_name,
      'mc_number', v_carrier.mc_number,
      'usdot_number', v_carrier.usdot_number),
    'timezone', v_carrier.home_terminal_timezone,
    'load_number', v_load.load_number,
    'broker_reference_number', v_load.broker_reference_number,
    'status_label', v_label,
    'last_update_at', v_last,
    'stops', v_stops
  );
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_load_tracking_link(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_load_tracking_link(uuid) TO anon, authenticated;
