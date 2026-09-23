-- Stage 4 part 2b follow-up: the carrier-creation exception in the billing stamp
-- states its session sources with COALESCE, per the definer fail-open guard.
CREATE OR REPLACE FUNCTION public.stamp_billing_company_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF public.current_company_id() IS NULL
     AND COALESCE(auth.role(), '') = 'service_role'
     AND NEW.company_id IS NOT NULL
     AND NEW.company_id::text = COALESCE(current_setting('app.creating_carrier', true), '') THEN
    RETURN NEW;
  END IF;
  NEW.company_id := public.current_company_id();
  RETURN NEW;
END;
$function$;
