
-- 0. Driver home terminal timezone
ALTER TABLE public.operators
  ADD COLUMN IF NOT EXISTS home_terminal_timezone text NOT NULL DEFAULT 'America/Chicago';

-- 1. Device models catalog
CREATE TABLE public.eld_device_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name text NOT NULL,
  device_make text NOT NULL,
  device_model text NOT NULL,
  fmcsa_registration_id text,
  support_phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eld_device_models TO authenticated;
GRANT ALL ON public.eld_device_models TO service_role;
ALTER TABLE public.eld_device_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "eld_device_models_select_authenticated" ON public.eld_device_models
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "eld_device_models_manage_management" ON public.eld_device_models
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

-- 2. Devices in trucks
CREATE TABLE public.eld_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  truck_number text,
  eld_device_model_id uuid REFERENCES public.eld_device_models(id) ON DELETE SET NULL,
  serial_number text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_eld_devices_operator ON public.eld_devices (operator_id) WHERE is_active;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eld_devices TO authenticated;
GRANT ALL ON public.eld_devices TO service_role;
ALTER TABLE public.eld_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "eld_devices_select_own_or_staff" ON public.eld_devices
  FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    OR EXISTS (SELECT 1 FROM public.operators o WHERE o.id = eld_devices.operator_id AND o.user_id = auth.uid())
  );
CREATE POLICY "eld_devices_manage_management" ON public.eld_devices
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

-- 3. Malfunction events
CREATE TABLE public.eld_malfunction_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  eld_device_id uuid REFERENCES public.eld_devices(id) ON DELETE SET NULL,
  discovered_at timestamptz NOT NULL,
  discovered_location text NOT NULL,
  malfunction_code text NOT NULL CHECK (malfunction_code IN ('P','E','T','L','R','S','O')),
  malfunction_description text NOT NULL,
  driver_notes text,
  hinders_hos_recording boolean NOT NULL DEFAULT true,
  backdate_reason text,
  repair_deadline date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','closed')),
  resolved_at timestamptz,
  resolution_notes text,
  carrier_acknowledged_at timestamptz,
  carrier_acknowledged_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- frozen device snapshot
  device_provider text,
  device_make text,
  device_model text,
  device_serial text,
  eld_registration_id text,
  -- notice delivery
  notice_pdf_path text,
  notice_generated_at timestamptz,
  notice_uploaded_at timestamptz,
  notice_sent_at timestamptz,
  notice_send_attempts int NOT NULL DEFAULT 0,
  notice_last_send_error text,
  -- escalation suppression
  escalations_suppressed_at timestamptz,
  escalations_suppressed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  escalations_suppressed_reason text,
  escalations_suppressed_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_eld_events_operator ON public.eld_malfunction_events (operator_id);
CREATE INDEX idx_eld_events_open ON public.eld_malfunction_events (status, repair_deadline) WHERE status = 'open';
CREATE INDEX idx_eld_events_pending_send ON public.eld_malfunction_events (notice_uploaded_at)
  WHERE notice_sent_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.eld_malfunction_events TO authenticated;
GRANT ALL ON public.eld_malfunction_events TO service_role;
ALTER TABLE public.eld_malfunction_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eld_events_select_own_or_staff" ON public.eld_malfunction_events
  FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    OR EXISTS (SELECT 1 FROM public.operators o WHERE o.id = eld_malfunction_events.operator_id AND o.user_id = auth.uid())
  );
CREATE POLICY "eld_events_insert_own" ON public.eld_malfunction_events
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.operators o WHERE o.id = eld_malfunction_events.operator_id AND o.user_id = auth.uid())
  );
CREATE POLICY "eld_events_update_own_notes" ON public.eld_malfunction_events
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.operators o WHERE o.id = eld_malfunction_events.operator_id AND o.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.operators o WHERE o.id = eld_malfunction_events.operator_id AND o.user_id = auth.uid())
  );
CREATE POLICY "eld_events_staff_update" ON public.eld_malfunction_events
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- Column-level immutability for drivers (federal notice basis)
CREATE OR REPLACE FUNCTION public.enforce_eld_event_driver_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Drivers may only change driver_notes (and the delivery bookkeeping the client owns)
  IF (NEW.operator_id, NEW.eld_device_id, NEW.discovered_at, NEW.discovered_location,
      NEW.malfunction_code, NEW.malfunction_description, NEW.hinders_hos_recording,
      NEW.backdate_reason, NEW.repair_deadline, NEW.status, NEW.resolved_at, NEW.resolution_notes,
      NEW.carrier_acknowledged_at, NEW.carrier_acknowledged_by,
      NEW.device_provider, NEW.device_make, NEW.device_model, NEW.device_serial, NEW.eld_registration_id,
      NEW.notice_generated_at, NEW.notice_sent_at, NEW.notice_send_attempts,
      NEW.escalations_suppressed_at, NEW.escalations_suppressed_by,
      NEW.escalations_suppressed_reason, NEW.escalations_suppressed_until)
     IS DISTINCT FROM
     (OLD.operator_id, OLD.eld_device_id, OLD.discovered_at, OLD.discovered_location,
      OLD.malfunction_code, OLD.malfunction_description, OLD.hinders_hos_recording,
      OLD.backdate_reason, OLD.repair_deadline, OLD.status, OLD.resolved_at, OLD.resolution_notes,
      OLD.carrier_acknowledged_at, OLD.carrier_acknowledged_by,
      OLD.device_provider, OLD.device_make, OLD.device_model, OLD.device_serial, OLD.eld_registration_id,
      OLD.notice_generated_at, OLD.notice_sent_at, OLD.notice_send_attempts,
      OLD.escalations_suppressed_at, OLD.escalations_suppressed_by,
      OLD.escalations_suppressed_reason, OLD.escalations_suppressed_until)
  THEN
    RAISE EXCEPTION 'This malfunction record is locked. Drivers may only update their own notes.';
  END IF;

  -- The notice upload path is the only delivery field the driver client may set, once.
  IF OLD.notice_uploaded_at IS NOT NULL AND NEW.notice_uploaded_at IS DISTINCT FROM OLD.notice_uploaded_at THEN
    RAISE EXCEPTION 'Notice upload timestamp is immutable once set.';
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_eld_event_driver_update
  BEFORE UPDATE ON public.eld_malfunction_events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_eld_event_driver_update();

-- Suppression must be justified and expire within 7 days
CREATE OR REPLACE FUNCTION public.enforce_eld_suppression_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.escalations_suppressed_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.escalations_suppressed_at IS DISTINCT FROM OLD.escalations_suppressed_at)
  THEN
    IF NEW.escalations_suppressed_reason IS NULL OR btrim(NEW.escalations_suppressed_reason) = '' THEN
      RAISE EXCEPTION 'A written reason is required to pause escalations.';
    END IF;
    IF NEW.escalations_suppressed_until IS NULL THEN
      RAISE EXCEPTION 'An escalation pause must have an expiry date.';
    END IF;
    IF NEW.escalations_suppressed_until > (NEW.escalations_suppressed_at AT TIME ZONE 'UTC')::date + 7 THEN
      RAISE EXCEPTION 'An escalation pause may not exceed 7 days.';
    END IF;
    IF NEW.escalations_suppressed_until < (NEW.escalations_suppressed_at AT TIME ZONE 'UTC')::date THEN
      RAISE EXCEPTION 'An escalation pause expiry may not be in the past.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_eld_suppression_rules
  BEFORE INSERT OR UPDATE ON public.eld_malfunction_events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_eld_suppression_rules();

CREATE TRIGGER trg_eld_events_updated_at
  BEFORE UPDATE ON public.eld_malfunction_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_eld_devices_updated_at
  BEFORE UPDATE ON public.eld_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_eld_device_models_updated_at
  BEFORE UPDATE ON public.eld_device_models
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Notification log
CREATE TABLE public.eld_malfunction_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.eld_malfunction_events(id) ON DELETE CASCADE,
  notification_type text NOT NULL CHECK (notification_type IN ('escalation_day','ack_overdue','digest','extension_prompt','notice_stuck')),
  day_number int,
  recipient_user_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('in_app','email')),
  sent_on date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eld_notifications_unique UNIQUE NULLS NOT DISTINCT
    (event_id, recipient_user_id, notification_type, day_number, channel, sent_on)
);
CREATE UNIQUE INDEX idx_eld_notifications_digest_daily
  ON public.eld_malfunction_notifications (recipient_user_id, sent_on)
  WHERE notification_type = 'digest';
GRANT SELECT ON public.eld_malfunction_notifications TO authenticated;
GRANT ALL ON public.eld_malfunction_notifications TO service_role;
ALTER TABLE public.eld_malfunction_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "eld_notifications_select_staff" ON public.eld_malfunction_notifications
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) OR recipient_user_id = auth.uid());

-- 5. Carrier notification recipients
CREATE TABLE public.carrier_notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  label text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carrier_notification_settings TO authenticated;
GRANT ALL ON public.carrier_notification_settings TO service_role;
ALTER TABLE public.carrier_notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "carrier_notification_settings_select_staff" ON public.carrier_notification_settings
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "carrier_notification_settings_manage_management" ON public.carrier_notification_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));
CREATE TRIGGER trg_carrier_notification_settings_updated_at
  BEFORE UPDATE ON public.carrier_notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Quarterly blank log acknowledgments
CREATE TABLE public.blank_log_acknowledgments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  quarter_key text NOT NULL,
  sheets_confirmed boolean NOT NULL DEFAULT true,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operator_id, quarter_key)
);
GRANT SELECT, INSERT, UPDATE ON public.blank_log_acknowledgments TO authenticated;
GRANT ALL ON public.blank_log_acknowledgments TO service_role;
ALTER TABLE public.blank_log_acknowledgments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blank_log_ack_select_own_or_staff" ON public.blank_log_acknowledgments
  FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    OR EXISTS (SELECT 1 FROM public.operators o WHERE o.id = blank_log_acknowledgments.operator_id AND o.user_id = auth.uid())
  );
CREATE POLICY "blank_log_ack_write_own" ON public.blank_log_acknowledgments
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.operators o WHERE o.id = blank_log_acknowledgments.operator_id AND o.user_id = auth.uid()));
CREATE POLICY "blank_log_ack_update_own" ON public.blank_log_acknowledgments
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.operators o WHERE o.id = blank_log_acknowledgments.operator_id AND o.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.operators o WHERE o.id = blank_log_acknowledgments.operator_id AND o.user_id = auth.uid()));
CREATE TRIGGER trg_blank_log_ack_updated_at
  BEFORE UPDATE ON public.blank_log_acknowledgments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
