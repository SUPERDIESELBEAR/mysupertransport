CREATE OR REPLACE FUNCTION public.record_rods_amendments(_day_id uuid, _reason text, _changes jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_day public.rods_days; v_n integer := 0; v_item jsonb;
BEGIN
  SELECT * INTO v_day FROM public.rods_days WHERE id = _day_id;
  IF v_day.id IS NULL THEN RAISE EXCEPTION 'Log not found.'; END IF;
  IF coalesce(public.is_own_rods_operator(v_day.operator_id), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Only the driver may record their own amendment.';
  END IF;
  IF coalesce(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'A written reason is required.'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_changes) LOOP
    IF coalesce(btrim(v_item->>'field_path'),'') = '' THEN
      RAISE EXCEPTION 'field_path is required on every amendment row.';
    END IF;
    INSERT INTO public.rods_amendments (
      operator_id, rods_day_id, original_day_id, log_date,
      field_path, old_value, new_value, reason, created_by
    ) VALUES (
      v_day.operator_id, v_day.id, v_day.supersedes_day_id, v_day.log_date,
      v_item->>'field_path', v_item->>'old_value', v_item->>'new_value', _reason, auth.uid()
    );
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_rods_event_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_locked boolean;
BEGIN
  SELECT locked INTO v_locked FROM public.rods_days
    WHERE id = COALESCE(NEW.rods_day_id, OLD.rods_day_id);
  IF coalesce(v_locked, false)
     AND current_setting('rods.privileged', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'This log is certified and is a federal record. Its duty-status entries cannot be changed.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;