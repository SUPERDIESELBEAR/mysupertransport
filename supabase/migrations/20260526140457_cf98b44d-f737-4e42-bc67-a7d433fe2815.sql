
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
BEGIN
  -- Skip rows dated in the future (Chicago)
  IF NEW.log_date > v_today THEN
    RETURN NEW;
  END IF;

  -- Respect excluded_from_dispatch
  SELECT excluded_from_dispatch INTO v_excluded
  FROM public.operators WHERE id = NEW.operator_id;
  IF COALESCE(v_excluded, false) = true THEN
    RETURN NEW;
  END IF;

  -- Find the latest log on or before today for this operator
  SELECT log_date, status
  INTO v_latest
  FROM public.dispatch_daily_log
  WHERE operator_id = NEW.operator_id
    AND log_date <= v_today
  ORDER BY log_date DESC, created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Upsert active_dispatch only if status differs
  INSERT INTO public.active_dispatch (operator_id, dispatch_status, updated_at)
  VALUES (NEW.operator_id, v_latest.status, now())
  ON CONFLICT (operator_id) DO UPDATE
    SET dispatch_status = EXCLUDED.dispatch_status,
        updated_at      = now()
    WHERE public.active_dispatch.dispatch_status IS DISTINCT FROM EXCLUDED.dispatch_status;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_active_dispatch_from_log ON public.dispatch_daily_log;
CREATE TRIGGER trg_sync_active_dispatch_from_log
AFTER INSERT OR UPDATE OF status, log_date ON public.dispatch_daily_log
FOR EACH ROW
EXECUTE FUNCTION public.sync_active_dispatch_from_log();
