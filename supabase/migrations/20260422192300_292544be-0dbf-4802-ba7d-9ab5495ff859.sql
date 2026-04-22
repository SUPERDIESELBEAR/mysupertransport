-- Trigger function: notify owner/management when Stage 8 is submitted
CREATE OR REPLACE FUNCTION public.notify_owner_on_pay_setup_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_op            RECORD;
  v_app           RECORD;
  v_operator_name TEXT;
  v_contractor_label TEXT;
  v_recipient     RECORD;
  v_fn_url        CONSTANT TEXT := 'https://qgxpkcudwjmacrdcyvhj.supabase.co/functions/v1/notify-pay-setup-submitted';
  v_anon_key      CONSTANT TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFneHBrY3Vkd2ptYWNyZGN5dmhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NDg3NDgsImV4cCI6MjA4ODQyNDc0OH0.LoP0_X7zPsOL4-GHQim1orOhlqk6znV6i-tGB7__66o';
BEGIN
  -- Only fire on transition: submitted_at NULL -> NOT NULL AND terms accepted
  IF NEW.submitted_at IS NULL THEN RETURN NEW; END IF;
  IF NEW.terms_accepted IS NOT TRUE THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.submitted_at IS NOT NULL THEN RETURN NEW; END IF;

  -- Look up operator + driver name
  SELECT o.id, o.user_id, o.application_id
  INTO v_op
  FROM public.operators o
  WHERE o.id = NEW.operator_id;

  IF NOT FOUND THEN RETURN NEW; END IF;

  v_operator_name := COALESCE(
    NULLIF(TRIM(COALESCE(NEW.legal_first_name,'') || ' ' || COALESCE(NEW.legal_last_name,'')), ''),
    'A driver'
  );

  IF v_op.application_id IS NOT NULL THEN
    SELECT first_name, last_name INTO v_app
    FROM public.applications WHERE id = v_op.application_id;
    IF FOUND THEN
      v_operator_name := COALESCE(
        NULLIF(TRIM(COALESCE(v_app.first_name,'') || ' ' || COALESCE(v_app.last_name,'')), ''),
        v_operator_name
      );
    END IF;
  END IF;

  v_contractor_label := CASE
    WHEN NEW.contractor_type = 'business' AND NEW.business_name IS NOT NULL AND TRIM(NEW.business_name) <> ''
      THEN 'Business (' || NEW.business_name || ')'
    WHEN NEW.contractor_type = 'business' THEN 'Business'
    ELSE 'Individual'
  END;

  -- Notify each owner/management user who has the preference enabled
  FOR v_recipient IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role IN ('owner', 'management')
      AND COALESCE(
        (SELECT in_app_enabled FROM public.notification_preferences
         WHERE user_id = ur.user_id AND event_type = 'pay_setup_submitted' LIMIT 1),
        ur.role = 'owner'    -- default: ON for owner, OFF for others
      ) = TRUE
  LOOP
    -- Dedupe: skip if same recipient was alerted about this operator in the last 30 minutes
    IF EXISTS (
      SELECT 1 FROM public.notifications
      WHERE user_id = v_recipient.user_id
        AND type    = 'pay_setup_submitted'
        AND link    = '/management?operator=' || NEW.operator_id::text
        AND sent_at > now() - interval '30 minutes'
    ) THEN CONTINUE; END IF;

    INSERT INTO public.notifications (user_id, title, body, type, channel, link)
    VALUES (
      v_recipient.user_id,
      '💰 Pay setup ready — ' || v_operator_name,
      v_operator_name || ' submitted their Stage 8 Contractor Pay Setup as ' || v_contractor_label || '. Send the payroll setup link.',
      'pay_setup_submitted',
      'in_app',
      '/management?operator=' || NEW.operator_id::text
    );
  END LOOP;

  -- Fire edge function for email delivery
  PERFORM net.http_post(
    url     := v_fn_url,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_anon_key),
    body    := jsonb_build_object(
      'operator_id', NEW.operator_id::text,
      'contractor_pay_setup_id', NEW.id::text
    )
  );

  RETURN NEW;
END;
$function$;

-- Drop existing trigger if any, then create it
DROP TRIGGER IF EXISTS notify_owner_on_pay_setup_submitted ON public.contractor_pay_setup;
CREATE TRIGGER notify_owner_on_pay_setup_submitted
AFTER INSERT OR UPDATE ON public.contractor_pay_setup
FOR EACH ROW
EXECUTE FUNCTION public.notify_owner_on_pay_setup_submitted();

-- Seed preference: ON for owner, default OFF for other management users
INSERT INTO public.notification_preferences (user_id, event_type, in_app_enabled, email_enabled)
SELECT ur.user_id, 'pay_setup_submitted', true, true
FROM public.user_roles ur
WHERE ur.role = 'owner'
ON CONFLICT (user_id, event_type) DO NOTHING;