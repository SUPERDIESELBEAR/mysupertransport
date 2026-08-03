CREATE TABLE public.rods_divergences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  log_date date NOT NULL,
  local_row_id uuid,
  server_row_id uuid,
  differing_fields text[] NOT NULL DEFAULT '{}',
  local_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  server_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  detected_at timestamptz NOT NULL DEFAULT now(),
  device_info text,
  idempotency_key text NOT NULL UNIQUE,
  acknowledged boolean NOT NULL DEFAULT false,
  acknowledged_source text CHECK (acknowledged_source IN ('management','driver')),
  acknowledged_by uuid,
  acknowledged_reason text,
  acknowledged_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rods_divergences_operator_date ON public.rods_divergences (operator_id, log_date);
CREATE INDEX idx_rods_divergences_open ON public.rods_divergences (acknowledged, detected_at DESC);

GRANT SELECT ON public.rods_divergences TO authenticated;
GRANT ALL ON public.rods_divergences TO service_role;

ALTER TABLE public.rods_divergences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers read their own divergences"
  ON public.rods_divergences FOR SELECT TO authenticated
  USING (public.is_own_rods_operator(operator_id));

CREATE POLICY "Staff read all divergences"
  ON public.rods_divergences FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE TRIGGER rods_divergences_is_demo
  BEFORE INSERT OR UPDATE ON public.rods_divergences
  FOR EACH ROW EXECUTE FUNCTION public.enforce_record_is_demo();

CREATE TRIGGER update_rods_divergences_updated_at
  BEFORE UPDATE ON public.rods_divergences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Append-only: the filed observation is immutable, and the acknowledgement is
-- write-once. Nothing but the acknowledgement quartet may ever change, and
-- only from unacknowledged to acknowledged.
CREATE OR REPLACE FUNCTION public.enforce_rods_divergence_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'A divergence record cannot be deleted.'
      USING ERRCODE = 'P0110';
  END IF;

  IF NEW.operator_id IS DISTINCT FROM OLD.operator_id
     OR NEW.log_date IS DISTINCT FROM OLD.log_date
     OR NEW.local_row_id IS DISTINCT FROM OLD.local_row_id
     OR NEW.server_row_id IS DISTINCT FROM OLD.server_row_id
     OR NEW.differing_fields IS DISTINCT FROM OLD.differing_fields
     OR NEW.local_values IS DISTINCT FROM OLD.local_values
     OR NEW.server_values IS DISTINCT FROM OLD.server_values
     OR NEW.detected_at IS DISTINCT FROM OLD.detected_at
     OR NEW.device_info IS DISTINCT FROM OLD.device_info
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
    RAISE EXCEPTION 'The observed divergence is immutable once filed.'
      USING ERRCODE = 'P0111';
  END IF;

  IF OLD.acknowledged IS TRUE AND (
       NEW.acknowledged IS DISTINCT FROM OLD.acknowledged
       OR NEW.acknowledged_source IS DISTINCT FROM OLD.acknowledged_source
       OR NEW.acknowledged_by IS DISTINCT FROM OLD.acknowledged_by
       OR NEW.acknowledged_reason IS DISTINCT FROM OLD.acknowledged_reason
       OR NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at) THEN
    RAISE EXCEPTION 'An acknowledgement is written once and cannot be changed.'
      USING ERRCODE = 'P0112';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_rods_divergence_append_only() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER rods_divergences_append_only
  BEFORE UPDATE OR DELETE ON public.rods_divergences
  FOR EACH ROW EXECUTE FUNCTION public.enforce_rods_divergence_append_only();

-- File a divergence. Driver-only write path, deduped on the client key.
CREATE OR REPLACE FUNCTION public.record_rods_divergence(
  p_operator_id uuid,
  p_log_date date,
  p_local_row_id uuid,
  p_server_row_id uuid,
  p_differing_fields text[],
  p_local_values jsonb,
  p_server_values jsonb,
  p_detected_at timestamptz,
  p_device_info text,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_unit text;
  v_demo boolean;
BEGIN
  IF coalesce(public.is_own_rods_operator(p_operator_id), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF coalesce(btrim(p_idempotency_key), '') = '' THEN
    RAISE EXCEPTION 'An idempotency key is required.' USING ERRCODE = 'P0113';
  END IF;

  SELECT id INTO v_id FROM public.rods_divergences
   WHERE idempotency_key = p_idempotency_key;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- One open row per operator per day: a device that keeps re-detecting the
  -- same unresolved mismatch must not fan out into a wall of rows.
  SELECT id INTO v_id FROM public.rods_divergences
   WHERE operator_id = p_operator_id AND log_date = p_log_date AND acknowledged = false
   ORDER BY detected_at DESC LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.rods_divergences (
    operator_id, log_date, local_row_id, server_row_id, differing_fields,
    local_values, server_values, detected_at, device_info, idempotency_key
  ) VALUES (
    p_operator_id, p_log_date, p_local_row_id, p_server_row_id,
    coalesce(p_differing_fields, '{}'), coalesce(p_local_values, '{}'::jsonb),
    coalesce(p_server_values, '{}'::jsonb), coalesce(p_detected_at, now()),
    p_device_info, btrim(p_idempotency_key)
  )
  RETURNING id, is_demo INTO v_id, v_demo;

  IF v_demo IS NOT TRUE THEN
    SELECT unit_number INTO v_unit FROM public.operators WHERE id = p_operator_id;
    INSERT INTO public.notifications (user_id, type, title, body, link, priority, entity_type, entity_id)
    SELECT ur.user_id,
           'rods_divergence',
           'Certified log differs from the office copy'
             || coalesce(' — Unit ' || v_unit, '')
             || ' — ' || to_char(p_log_date, 'YYYY-MM-DD'),
           'The driver device holds a certified day that does not match the office record. Differing: '
             || coalesce(nullif(array_to_string(p_differing_fields, ', '), ''), 'row identity') || '.',
           '/dashboard?view=eld-malfunctions&divergence=' || v_id::text,
           'action',
           'rods_divergence',
           v_id
      FROM public.user_roles ur
     WHERE ur.role IN ('management', 'owner');
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_rods_divergence(uuid, date, uuid, uuid, text[], jsonb, jsonb, timestamptz, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_rods_divergence(uuid, date, uuid, uuid, text[], jsonb, jsonb, timestamptz, text, text) TO authenticated, service_role;

-- Acknowledge. Staff for anyone, driver for his own only. Write-once.
CREATE OR REPLACE FUNCTION public.acknowledge_rods_divergence(
  p_divergence_id uuid,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_operator uuid;
  v_ack boolean;
  v_source text;
BEGIN
  SELECT operator_id, acknowledged INTO v_operator, v_ack
    FROM public.rods_divergences WHERE id = p_divergence_id;
  IF v_operator IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0114';
  END IF;

  IF coalesce(public.is_staff(auth.uid()), false) IS TRUE THEN
    v_source := 'management';
  ELSIF coalesce(public.is_own_rods_operator(v_operator), false) IS TRUE THEN
    v_source := 'driver';
  ELSE
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF coalesce(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A written reason is required to resolve a divergence.'
      USING ERRCODE = 'P0115';
  END IF;

  -- Already resolved: return it rather than raising, so a replayed queue entry
  -- is a no-op instead of a permanent failure.
  IF v_ack IS TRUE THEN
    RETURN p_divergence_id;
  END IF;

  UPDATE public.rods_divergences
     SET acknowledged = true,
         acknowledged_source = v_source,
         acknowledged_by = auth.uid(),
         acknowledged_reason = btrim(p_reason),
         acknowledged_at = now()
   WHERE id = p_divergence_id;

  RETURN p_divergence_id;
END;
$$;

REVOKE ALL ON FUNCTION public.acknowledge_rods_divergence(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_rods_divergence(uuid, text) TO authenticated, service_role;