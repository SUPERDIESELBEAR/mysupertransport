CREATE TABLE public.eld_sync_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  log_date date,
  detail text NOT NULL DEFAULT '',
  raised_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  occurrences integer NOT NULL DEFAULT 1,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.eld_sync_alerts TO authenticated;
GRANT ALL ON public.eld_sync_alerts TO service_role;

ALTER TABLE public.eld_sync_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view eld sync alerts"
  ON public.eld_sync_alerts FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can acknowledge eld sync alerts"
  ON public.eld_sync_alerts FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- One OPEN alert per condition. Acknowledging re-arms it: a recurrence after
-- a human has handled it is a stronger signal, not a duplicate.
CREATE UNIQUE INDEX eld_sync_alerts_one_open_per_condition
  ON public.eld_sync_alerts (operator_id, (coalesce(log_date, DATE '1900-01-01')), kind)
  WHERE acknowledged_at IS NULL;

CREATE INDEX eld_sync_alerts_open_idx
  ON public.eld_sync_alerts (acknowledged_at, last_seen_at DESC);

CREATE TRIGGER update_eld_sync_alerts_updated_at
  BEFORE UPDATE ON public.eld_sync_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

/**
 * Raise (or bump) an ELD sync alert and fan it out to the management bell.
 *
 * SECURITY DEFINER because the caller is a driver, who has no INSERT policy on
 * notifications. Guard is a positive refuse with every operand coalesced, and
 * ownership is resolved from auth.uid() — the operator_id argument is checked,
 * never trusted.
 */
CREATE OR REPLACE FUNCTION public.raise_eld_sync_alert(
  p_operator_id uuid,
  p_kind text,
  p_log_date date,
  p_detail text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_allowed boolean;
  v_alert_id uuid;
  v_created boolean := false;
  v_unit text;
  v_title text;
BEGIN
  v_allowed := coalesce(public.is_own_rods_operator(p_operator_id), false)
            OR coalesce(public.is_staff(v_uid), false);
  IF v_allowed IS NOT TRUE THEN
    RAISE EXCEPTION 'not authorized to raise a sync alert for this operator';
  END IF;

  IF coalesce(p_kind, '') = '' THEN
    RAISE EXCEPTION 'alert kind is required';
  END IF;

  UPDATE public.eld_sync_alerts
     SET last_seen_at = now(),
         occurrences = occurrences + 1,
         detail = coalesce(p_detail, detail)
   WHERE operator_id = p_operator_id
     AND kind = p_kind
     AND coalesce(log_date, DATE '1900-01-01') = coalesce(p_log_date, DATE '1900-01-01')
     AND acknowledged_at IS NULL
   RETURNING id INTO v_alert_id;

  IF v_alert_id IS NULL THEN
    INSERT INTO public.eld_sync_alerts (kind, operator_id, log_date, detail)
    VALUES (p_kind, p_operator_id, p_log_date, coalesce(p_detail, ''))
    RETURNING id INTO v_alert_id;
    v_created := true;
  END IF;

  -- Fan out to the bell only on a fresh alert. A bump updates the row a human
  -- already has an item for; a second notification would be noise.
  IF v_created THEN
    SELECT unit_number INTO v_unit FROM public.operators WHERE id = p_operator_id;
    v_title := 'ELD sync: ' || replace(p_kind, '_', ' ')
      || coalesce(' — Unit ' || v_unit, '')
      || coalesce(' — ' || to_char(p_log_date, 'YYYY-MM-DD'), '');

    INSERT INTO public.notifications (user_id, type, title, body, link, priority, entity_type, entity_id)
    SELECT ur.user_id,
           'eld_sync_alert',
           v_title,
           coalesce(p_detail, ''),
           '/management?tab=driver&operator=' || p_operator_id::text,
           'high',
           'eld_sync_alert',
           v_alert_id
      FROM public.user_roles ur
     WHERE ur.role IN ('management', 'owner');
  END IF;

  RETURN v_alert_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.raise_eld_sync_alert(uuid, text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.raise_eld_sync_alert(uuid, text, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.raise_eld_sync_alert(uuid, text, date, text) TO service_role;

/**
 * Acknowledge an alert. This is what re-arms the dedupe, so it is staff-only
 * and written with the same positive refuse.
 */
CREATE OR REPLACE FUNCTION public.acknowledge_eld_sync_alert(p_alert_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF coalesce(public.is_staff(v_uid), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'not authorized to acknowledge sync alerts';
  END IF;

  UPDATE public.eld_sync_alerts
     SET acknowledged_at = now(), acknowledged_by = v_uid
   WHERE id = p_alert_id AND acknowledged_at IS NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.acknowledge_eld_sync_alert(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_eld_sync_alert(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_eld_sync_alert(uuid) TO service_role;