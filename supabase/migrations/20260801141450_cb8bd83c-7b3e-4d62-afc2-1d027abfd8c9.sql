CREATE OR REPLACE FUNCTION public.record_rods_unlock(p_operator_id uuid, p_rods_day_id uuid, p_log_date date, p_unlocked_at timestamp with time zone, p_local_certified_at timestamp with time zone, p_cancelled_entry_ids jsonb, p_cancelled_states jsonb, p_reason text, p_device_info text, p_idempotency_key uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_id uuid;
  v_unit text;
BEGIN
  -- Positive refuse: permit inside the IF, raise after it. A NULL from either
  -- predicate is coalesced to false, so an absent session refuses.
  IF coalesce(public.is_own_rods_operator(p_operator_id), false) IS TRUE THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF coalesce(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A written reason naming the office authorization is required.'
      USING ERRCODE = 'P0090';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'An idempotency key is required.' USING ERRCODE = 'P0091';
  END IF;

  -- A retried queue entry replays the same key. Return the existing row rather
  -- than raising: the record already landed, and the entry must succeed.
  SELECT id INTO v_id FROM public.rods_unlock_events
   WHERE idempotency_key = p_idempotency_key;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.rods_unlock_events (
    operator_id, rods_day_id, log_date, unlocked_at, local_certified_at,
    cancelled_entry_ids, cancelled_states, reason, device_info, idempotency_key
  ) VALUES (
    p_operator_id, p_rods_day_id, p_log_date,
    coalesce(p_unlocked_at, now()), p_local_certified_at,
    coalesce(p_cancelled_entry_ids, '[]'::jsonb),
    coalesce(p_cancelled_states, '{}'::jsonb),
    btrim(p_reason), p_device_info, p_idempotency_key
  )
  RETURNING id INTO v_id;

  SELECT unit_number INTO v_unit FROM public.operators WHERE id = p_operator_id;

  -- 'action' is the only high-urgency value notifications_priority_check
  -- accepts, and it is the bell's Action tab — where an unlock belongs.
  INSERT INTO public.notifications (user_id, type, title, body, link, priority, entity_type, entity_id)
  SELECT ur.user_id,
         'eld_log_unlocked',
         'ELD log unlocked' || coalesce(' — Unit ' || v_unit, '')
           || ' — ' || to_char(p_log_date, 'YYYY-MM-DD'),
         'A signed log was returned to draft on the driver device with office authorization: '
           || btrim(p_reason),
         '/dashboard?view=operator-detail&op=' || p_operator_id::text,
         'action',
         'rods_unlock_event',
         v_id
    FROM public.user_roles ur
   WHERE ur.role IN ('management', 'owner');

  RETURN v_id;
END;
$function$;