
CREATE OR REPLACE FUNCTION public.sync_active_dispatch_from_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Chicago')::date;
  v_latest RECORD;
  v_excluded boolean;
  v_new_status public.dispatch_status;
BEGIN
  IF NEW.log_date > v_today THEN
    RETURN NEW;
  END IF;

  SELECT excluded_from_dispatch INTO v_excluded
  FROM public.operators WHERE id = NEW.operator_id;
  IF COALESCE(v_excluded, false) = true THEN
    RETURN NEW;
  END IF;

  SELECT log_date, status::text AS status
  INTO v_latest
  FROM public.dispatch_daily_log
  WHERE operator_id = NEW.operator_id
    AND log_date <= v_today
  ORDER BY log_date DESC, created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_new_status := v_latest.status::public.dispatch_status;

  INSERT INTO public.active_dispatch (operator_id, dispatch_status, updated_at)
  VALUES (NEW.operator_id, v_new_status, now())
  ON CONFLICT (operator_id) DO UPDATE
    SET dispatch_status = EXCLUDED.dispatch_status,
        updated_at      = now()
    WHERE public.active_dispatch.dispatch_status IS DISTINCT FROM EXCLUDED.dispatch_status;

  RETURN NEW;
END;
$$;
