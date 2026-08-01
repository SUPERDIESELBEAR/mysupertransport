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

  IF v_created THEN
    SELECT unit_number INTO v_unit FROM public.operators WHERE id = p_operator_id;
    v_title := 'ELD sync: ' || replace(p_kind, '_', ' ')
      || coalesce(' — Unit ' || v_unit, '')
      || coalesce(' — ' || to_char(p_log_date, 'YYYY-MM-DD'), '');

    -- entity_id is the ALERT, because archiving the notification acknowledges
    -- that alert. The driver is reached through the link instead.
    INSERT INTO public.notifications (user_id, type, title, body, link, priority, entity_type, entity_id)
    SELECT ur.user_id,
           'eld_sync_alert',
           v_title,
           coalesce(p_detail, ''),
           '/dashboard?view=operator-detail&op=' || p_operator_id::text,
           'high',
           'eld_sync_alert',
           v_alert_id
      FROM public.user_roles ur
     WHERE ur.role IN ('management', 'owner');
  END IF;

  RETURN v_alert_id;
END;
$function$;