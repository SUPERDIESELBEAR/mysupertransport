-- The guard previously keyed only on `escalations_suppressed_at` changing, so
-- an UPDATE that moved `escalations_suppressed_until` on its own was never
-- validated: the 7-day cap (P0064), the required reason (P0062) and the
-- no-past-expiry rule (P0065) could all be bypassed by editing the expiry
-- alone. That is precisely the unbounded pause the cap exists to prevent.
CREATE OR REPLACE FUNCTION public.enforce_eld_suppression_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.escalations_suppressed_at IS NOT NULL
     AND (
       TG_OP = 'INSERT'
       OR NEW.escalations_suppressed_at IS DISTINCT FROM OLD.escalations_suppressed_at
       OR NEW.escalations_suppressed_until IS DISTINCT FROM OLD.escalations_suppressed_until
     )
  THEN
    IF NEW.escalations_suppressed_reason IS NULL OR btrim(NEW.escalations_suppressed_reason) = '' THEN
      RAISE EXCEPTION 'A written reason is required to pause escalations.' USING ERRCODE = 'P0062';
    END IF;
    IF NEW.escalations_suppressed_until IS NULL THEN
      RAISE EXCEPTION 'An escalation pause must have an expiry date.' USING ERRCODE = 'P0063';
    END IF;
    IF NEW.escalations_suppressed_until > (NEW.escalations_suppressed_at AT TIME ZONE 'UTC')::date + 7 THEN
      RAISE EXCEPTION 'An escalation pause may not exceed 7 days.' USING ERRCODE = 'P0064';
    END IF;
    IF NEW.escalations_suppressed_until < (NEW.escalations_suppressed_at AT TIME ZONE 'UTC')::date THEN
      RAISE EXCEPTION 'An escalation pause expiry may not be in the past.' USING ERRCODE = 'P0065';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;