CREATE TABLE public.rods_unlock_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  -- Deliberately NO foreign key to rods_days: the day may never have reached
  -- the server (that is precisely why it was unlocked), and an FK would reject
  -- the audit insert exactly when it matters most.
  rods_day_id uuid,
  log_date date NOT NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  local_certified_at timestamptz,
  cancelled_entry_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  cancelled_states jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NOT NULL,
  device_info text,
  -- Client-generated, stable across retries of the same queued unlock record.
  idempotency_key uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rods_unlock_events_day ON public.rods_unlock_events (rods_day_id);
CREATE INDEX idx_rods_unlock_events_operator_date ON public.rods_unlock_events (operator_id, log_date DESC);

-- Append-only: SELECT and INSERT only. No UPDATE, no DELETE, for any client role.
GRANT SELECT, INSERT ON public.rods_unlock_events TO authenticated;
GRANT ALL ON public.rods_unlock_events TO service_role;

ALTER TABLE public.rods_unlock_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers record their own unlocks"
  ON public.rods_unlock_events FOR INSERT TO authenticated
  WITH CHECK (coalesce(public.is_own_rods_operator(operator_id), false));

CREATE POLICY "Drivers read their own unlocks"
  ON public.rods_unlock_events FOR SELECT TO authenticated
  USING (coalesce(public.is_own_rods_operator(operator_id), false));

CREATE POLICY "Management reads all unlocks"
  ON public.rods_unlock_events FOR SELECT TO authenticated
  USING (coalesce(public.has_role(auth.uid(), 'management'::app_role), false)
      OR coalesce(public.has_role(auth.uid(), 'owner'::app_role), false));

CREATE OR REPLACE FUNCTION public.record_rods_unlock(
  p_operator_id uuid,
  p_rods_day_id uuid,
  p_log_date date,
  p_unlocked_at timestamptz,
  p_local_certified_at timestamptz,
  p_cancelled_entry_ids jsonb,
  p_cancelled_states jsonb,
  p_reason text,
  p_device_info text,
  p_idempotency_key uuid
)
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

  INSERT INTO public.notifications (user_id, type, title, body, link, priority, entity_type, entity_id)
  SELECT ur.user_id,
         'eld_log_unlocked',
         'ELD log unlocked' || coalesce(' — Unit ' || v_unit, '')
           || ' — ' || to_char(p_log_date, 'YYYY-MM-DD'),
         'A signed log was returned to draft on the driver device with office authorization: '
           || btrim(p_reason),
         '/dashboard?view=operator-detail&op=' || p_operator_id::text,
         'high',
         'rods_unlock_event',
         v_id
    FROM public.user_roles ur
   WHERE ur.role IN ('management', 'owner');

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_rods_unlock(uuid, uuid, date, timestamptz, timestamptz, jsonb, jsonb, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_rods_unlock(uuid, uuid, date, timestamptz, timestamptz, jsonb, jsonb, text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_rods_unlock(uuid, uuid, date, timestamptz, timestamptz, jsonb, jsonb, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_rods_unlock(uuid, uuid, date, timestamptz, timestamptz, jsonb, jsonb, text, text, uuid) TO service_role;