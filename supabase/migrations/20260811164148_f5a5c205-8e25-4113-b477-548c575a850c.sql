CREATE OR REPLACE FUNCTION public.sync_ica_completion_to_onboarding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_signed_date DATE;
  v_sent_date   DATE;
BEGIN
  IF NEW.operator_id IS NOT NULL
     AND (NEW.status = 'fully_executed' OR NEW.contractor_signed_at IS NOT NULL) THEN

    v_signed_date := (COALESCE(NEW.contractor_signed_at, NEW.carrier_signed_at, now())
                        AT TIME ZONE 'America/Chicago')::date;
    v_sent_date   := (COALESCE(NEW.created_at, now()) AT TIME ZONE 'America/Chicago')::date;

    PERFORM set_config('app.ica_sync_cascade', '1', true);

    UPDATE public.onboarding_status
    SET
      ica_status      = 'complete',
      ica_signed_date = COALESCE(ica_signed_date, v_signed_date),
      ica_sent_date   = COALESCE(ica_sent_date, v_sent_date),
      updated_at      = now()
    WHERE operator_id = NEW.operator_id
      AND (COALESCE(ica_status::text, '') <> 'complete'
           OR ica_signed_date IS NULL
           OR ica_sent_date IS NULL);

    PERFORM set_config('app.ica_sync_cascade', '', true);
  END IF;

  RETURN NEW;
END;
$function$;