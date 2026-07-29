-- ============ rods_days ============
CREATE TABLE public.rods_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  log_date date NOT NULL,
  record_source text NOT NULL DEFAULT 'keyed' CHECK (record_source IN ('keyed','eld_document')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','certified','superseded')),
  locked boolean NOT NULL DEFAULT false,
  is_reconstructed boolean NOT NULL DEFAULT false,
  supersedes_day_id uuid REFERENCES public.rods_days(id),
  amendment_reason text,

  -- 395.8 header
  carrier_name text,
  carrier_usdot text,
  carrier_mc text,
  home_terminal_address text,
  truck_number text,
  trailer_numbers text,
  co_driver_name text,
  shipping_document_no text,
  from_location text,
  to_location text,
  total_miles_driving_today integer,
  total_mileage_today integer,

  -- driver-entered RECAP (never computed, never validated)
  recap_on_duty_today text,
  recap_last_7_days text,
  recap_available_tomorrow text,
  recap_last_8_days text,

  -- derived status totals (minutes)
  total_off_duty_minutes integer NOT NULL DEFAULT 0,
  total_sleeper_minutes integer NOT NULL DEFAULT 0,
  total_driving_minutes integer NOT NULL DEFAULT 0,
  total_on_duty_minutes integer NOT NULL DEFAULT 0,

  -- files
  source_document_path text,
  pdf_path text,

  -- certification
  certified_at timestamptz,
  certified_by uuid,
  certification_legal_name text,
  certification_signature_path text,
  certification_device_info text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.rods_days.record_source IS
  'keyed = driver entered duty-status segments in SUPERDRIVE. eld_document = a log produced by the driver''s own ELD and uploaded as a file; source_document_path IS the record, there are no rods_events and no generated pdf_path.';

COMMENT ON COLUMN public.rods_days.status IS
  'Storage state only: draft | certified | superseded. INTENTIONAL MISMATCH — eld_document rows are stored as status = ''certified'' (and locked = true) so they occupy the partial unique index slot for that date, but the user-facing label for them is "On file (ELD log)", never "Certified". Do not "fix" this into matching labels.';

COMMENT ON COLUMN public.rods_days.is_reconstructed IS
  'True only for days keyed after the fact under 49 CFR 395.34(a)(2). Always false for eld_document rows — those were retrieved, not reconstructed.';

CREATE UNIQUE INDEX rods_days_one_certified_per_date
  ON public.rods_days (operator_id, log_date) WHERE status = 'certified';
CREATE INDEX rods_days_operator_date_idx ON public.rods_days (operator_id, log_date DESC);
CREATE INDEX rods_days_supersedes_idx ON public.rods_days (supersedes_day_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rods_days TO authenticated;
GRANT ALL ON public.rods_days TO service_role;
ALTER TABLE public.rods_days ENABLE ROW LEVEL SECURITY;

-- ============ rods_events ============
CREATE TABLE public.rods_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rods_day_id uuid NOT NULL REFERENCES public.rods_days(id) ON DELETE CASCADE,
  start_minute integer NOT NULL CHECK (start_minute >= 0 AND start_minute <= 1439),
  end_minute integer NOT NULL CHECK (end_minute >= 1 AND end_minute <= 1440),
  duty_status integer NOT NULL CHECK (duty_status BETWEEN 1 AND 4),
  city text NOT NULL,
  state text NOT NULL,
  remarks text,
  is_short_period boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_minute > start_minute)
);
CREATE INDEX rods_events_day_idx ON public.rods_events (rods_day_id, start_minute);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rods_events TO authenticated;
GRANT ALL ON public.rods_events TO service_role;
ALTER TABLE public.rods_events ENABLE ROW LEVEL SECURITY;

-- ============ rods_amendments ============
CREATE TABLE public.rods_amendments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  rods_day_id uuid NOT NULL REFERENCES public.rods_days(id),
  original_day_id uuid REFERENCES public.rods_days(id),
  log_date date NOT NULL,
  field_path text NOT NULL,
  old_value text,
  new_value text,
  reason text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.rods_amendments.field_path IS
  'Never null. For an uploaded-document replacement this is the literal string source_document_path, with the old and new storage paths in old_value/new_value. Stage 4 archive export queries group on this column.';
CREATE INDEX rods_amendments_day_idx ON public.rods_amendments (rods_day_id);
CREATE INDEX rods_amendments_operator_idx ON public.rods_amendments (operator_id, log_date DESC);

GRANT SELECT ON public.rods_amendments TO authenticated;
GRANT ALL ON public.rods_amendments TO service_role;
ALTER TABLE public.rods_amendments ENABLE ROW LEVEL SECURITY;

-- ============ helper ============
CREATE OR REPLACE FUNCTION public.is_own_rods_operator(_operator_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.operators o WHERE o.id = _operator_id AND o.user_id = auth.uid());
$$;

-- ============ policies ============
CREATE POLICY "Drivers read own rods days" ON public.rods_days
  FOR SELECT TO authenticated USING (public.is_own_rods_operator(operator_id));
CREATE POLICY "Staff read all rods days" ON public.rods_days
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Drivers insert own rods days" ON public.rods_days
  FOR INSERT TO authenticated WITH CHECK (public.is_own_rods_operator(operator_id) AND locked = false);
CREATE POLICY "Drivers update own unlocked rods days" ON public.rods_days
  FOR UPDATE TO authenticated
  USING (public.is_own_rods_operator(operator_id) AND locked = false)
  WITH CHECK (public.is_own_rods_operator(operator_id));
CREATE POLICY "Drivers delete own unlocked rods days" ON public.rods_days
  FOR DELETE TO authenticated USING (public.is_own_rods_operator(operator_id) AND locked = false);

CREATE POLICY "Drivers read own rods events" ON public.rods_events
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.rods_days d WHERE d.id = rods_day_id AND public.is_own_rods_operator(d.operator_id)));
CREATE POLICY "Staff read all rods events" ON public.rods_events
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Drivers write own unlocked rods events" ON public.rods_events
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.rods_days d WHERE d.id = rods_day_id AND public.is_own_rods_operator(d.operator_id) AND d.locked = false));
CREATE POLICY "Drivers update own unlocked rods events" ON public.rods_events
  FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.rods_days d WHERE d.id = rods_day_id AND public.is_own_rods_operator(d.operator_id) AND d.locked = false))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.rods_days d WHERE d.id = rods_day_id AND public.is_own_rods_operator(d.operator_id) AND d.locked = false));
CREATE POLICY "Drivers delete own unlocked rods events" ON public.rods_events
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.rods_days d WHERE d.id = rods_day_id AND public.is_own_rods_operator(d.operator_id) AND d.locked = false));

CREATE POLICY "Drivers read own rods amendments" ON public.rods_amendments
  FOR SELECT TO authenticated USING (public.is_own_rods_operator(operator_id));
CREATE POLICY "Staff read all rods amendments" ON public.rods_amendments
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- ============ immutability triggers ============
CREATE OR REPLACE FUNCTION public.enforce_rods_day_lock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.locked THEN
      RAISE EXCEPTION 'This log is certified and is a federal record. It cannot be deleted.';
    END IF;
    IF OLD.supersedes_day_id IS NOT NULL THEN
      RAISE EXCEPTION 'Use discard_rods_amendment() to remove a correction draft.';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.locked AND current_setting('rods.privileged', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'This log is certified and is a federal record. It cannot be changed.';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER rods_days_lock_update BEFORE UPDATE ON public.rods_days
  FOR EACH ROW EXECUTE FUNCTION public.enforce_rods_day_lock();
CREATE TRIGGER rods_days_lock_delete BEFORE DELETE ON public.rods_days
  FOR EACH ROW EXECUTE FUNCTION public.enforce_rods_day_lock();

CREATE OR REPLACE FUNCTION public.enforce_rods_event_lock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_locked boolean;
BEGIN
  SELECT locked INTO v_locked FROM public.rods_days
    WHERE id = COALESCE(NEW.rods_day_id, OLD.rods_day_id);
  IF v_locked AND current_setting('rods.privileged', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'This log is certified and is a federal record. Its duty-status entries cannot be changed.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER rods_events_lock BEFORE INSERT OR UPDATE OR DELETE ON public.rods_events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_rods_event_lock();

-- A date that has ever had a certified row must always keep exactly one.
CREATE OR REPLACE FUNCTION public.enforce_rods_certified_continuity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'certified' AND NEW.status <> 'certified' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.rods_days
       WHERE operator_id = NEW.operator_id AND log_date = NEW.log_date
         AND status = 'certified' AND id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'A certified log for % cannot be superseded unless a replacement is certified in the same transaction.', NEW.log_date;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER rods_days_certified_continuity
  AFTER UPDATE ON public.rods_days DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.enforce_rods_certified_continuity();

-- ============ certify_rods_day ============
CREATE OR REPLACE FUNCTION public.certify_rods_day(
  _day_id uuid,
  _legal_name text,
  _signature_path text,
  _pdf_path text DEFAULT NULL,
  _device_info text DEFAULT NULL
) RETURNS public.rods_days
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_day public.rods_days; v_orig uuid;
BEGIN
  SELECT * INTO v_day FROM public.rods_days WHERE id = _day_id FOR UPDATE;
  IF v_day.id IS NULL THEN RAISE EXCEPTION 'Log not found.'; END IF;
  IF NOT (public.is_own_rods_operator(v_day.operator_id)) THEN
    RAISE EXCEPTION 'Only the driver may certify their own log.';
  END IF;
  IF v_day.status <> 'draft' THEN RAISE EXCEPTION 'Only a draft log can be certified.'; END IF;
  IF coalesce(btrim(_legal_name),'') = '' THEN RAISE EXCEPTION 'A typed legal name is required.'; END IF;

  PERFORM set_config('rods.privileged','on', true);
  v_orig := v_day.supersedes_day_id;

  IF v_orig IS NOT NULL THEN
    UPDATE public.rods_days
       SET status = 'superseded', locked = true, updated_at = now()
     WHERE id = v_orig;
  END IF;

  UPDATE public.rods_days
     SET status = 'certified',
         locked = true,
         certified_at = now(),
         certified_by = auth.uid(),
         certification_legal_name = _legal_name,
         certification_signature_path = _signature_path,
         certification_device_info = _device_info,
         pdf_path = COALESCE(_pdf_path, pdf_path),
         updated_at = now()
   WHERE id = _day_id
  RETURNING * INTO v_day;

  PERFORM set_config('rods.privileged','off', true);
  RETURN v_day;
END;
$$;
REVOKE ALL ON FUNCTION public.certify_rods_day(uuid,text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.certify_rods_day(uuid,text,text,text,text) TO authenticated;

-- ============ discard_rods_amendment ============
CREATE OR REPLACE FUNCTION public.discard_rods_amendment(_day_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_day public.rods_days;
BEGIN
  SELECT * INTO v_day FROM public.rods_days WHERE id = _day_id FOR UPDATE;
  IF v_day.id IS NULL THEN RAISE EXCEPTION 'Log not found.'; END IF;
  IF NOT public.is_own_rods_operator(v_day.operator_id) THEN
    RAISE EXCEPTION 'Only the driver may discard their own correction.';
  END IF;
  IF v_day.status <> 'draft' OR v_day.supersedes_day_id IS NULL THEN
    RAISE EXCEPTION 'Only an uncertified correction draft can be discarded.';
  END IF;
  DELETE FROM public.rods_events WHERE rods_day_id = _day_id;
  DELETE FROM public.rods_days WHERE id = _day_id;
END;
$$;
REVOKE ALL ON FUNCTION public.discard_rods_amendment(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.discard_rods_amendment(uuid) TO authenticated;

-- ============ replace_rods_document ============
CREATE OR REPLACE FUNCTION public.replace_rods_document(
  _day_id uuid,
  _new_path text,
  _reason text
) RETURNS public.rods_days
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old public.rods_days; v_new public.rods_days;
BEGIN
  SELECT * INTO v_old FROM public.rods_days WHERE id = _day_id FOR UPDATE;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'Log not found.'; END IF;
  IF NOT public.is_own_rods_operator(v_old.operator_id) THEN
    RAISE EXCEPTION 'Only the driver may replace their own document.';
  END IF;
  IF v_old.record_source <> 'eld_document' THEN
    RAISE EXCEPTION 'Only an uploaded ELD document can be replaced. Keyed logs are amended.';
  END IF;
  IF v_old.status <> 'certified' THEN RAISE EXCEPTION 'This document has already been replaced.'; END IF;
  IF coalesce(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'A written reason is required.'; END IF;
  IF coalesce(btrim(_new_path),'') = '' THEN RAISE EXCEPTION 'The replacement document is missing.'; END IF;

  PERFORM set_config('rods.privileged','on', true);

  -- Supersede + insert the replacement in one transaction. The partial unique
  -- index and the continuity trigger both reject any intermediate state.
  UPDATE public.rods_days SET status = 'superseded', updated_at = now() WHERE id = v_old.id;

  INSERT INTO public.rods_days (
    operator_id, log_date, record_source, status, locked, is_reconstructed,
    supersedes_day_id, amendment_reason,
    carrier_name, carrier_usdot, carrier_mc, home_terminal_address, truck_number,
    trailer_numbers, co_driver_name, shipping_document_no, from_location, to_location,
    total_miles_driving_today, total_mileage_today,
    source_document_path, certified_at, certified_by
  ) VALUES (
    v_old.operator_id, v_old.log_date, 'eld_document', 'certified', true, false,
    v_old.id, _reason,
    v_old.carrier_name, v_old.carrier_usdot, v_old.carrier_mc, v_old.home_terminal_address, v_old.truck_number,
    v_old.trailer_numbers, v_old.co_driver_name, v_old.shipping_document_no, v_old.from_location, v_old.to_location,
    v_old.total_miles_driving_today, v_old.total_mileage_today,
    _new_path, now(), auth.uid()
  ) RETURNING * INTO v_new;

  INSERT INTO public.rods_amendments (
    operator_id, rods_day_id, original_day_id, log_date,
    field_path, old_value, new_value, reason, created_by
  ) VALUES (
    v_old.operator_id, v_new.id, v_old.id, v_old.log_date,
    'source_document_path', v_old.source_document_path, _new_path, _reason, auth.uid()
  );

  PERFORM set_config('rods.privileged','off', true);
  RETURN v_new;
END;
$$;
REVOKE ALL ON FUNCTION public.replace_rods_document(uuid,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.replace_rods_document(uuid,text,text) TO authenticated;

-- ============ record_rods_amendments (bulk field diff, server-side only) ============
CREATE OR REPLACE FUNCTION public.record_rods_amendments(
  _day_id uuid,
  _reason text,
  _changes jsonb
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_day public.rods_days; v_n integer := 0; v_item jsonb;
BEGIN
  SELECT * INTO v_day FROM public.rods_days WHERE id = _day_id;
  IF v_day.id IS NULL THEN RAISE EXCEPTION 'Log not found.'; END IF;
  IF NOT public.is_own_rods_operator(v_day.operator_id) THEN
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
$$;
REVOKE ALL ON FUNCTION public.record_rods_amendments(uuid,text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.record_rods_amendments(uuid,text,jsonb) TO authenticated;