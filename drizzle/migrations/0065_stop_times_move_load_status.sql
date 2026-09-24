-- 0065: a recorded stop arrival/departure moves the load's status FORWARD (P62, P63).
-- Undo: DROP TRIGGER trg_load_stops_advance_load_status ON public.load_stops;
--       DROP FUNCTION public.advance_load_status_from_stop();
--       restore log_load_status_change / enforce_loads_operator_update from 0061 / prior definitions
--       (i.e. remove the status_change_note read and the status_advance allowance).

CREATE OR REPLACE FUNCTION public.advance_load_status_from_stop()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_seq public.load_status[] := ARRAY['available','covered','dispatched','in_transit','at_delivery','delivered']::public.load_status[];
  v_status public.load_status;
  v_operator uuid;
  v_last_delivery uuid;
  v_is_last boolean;
  v_kind text;
  v_src public.stop_time_source;
  v_target public.load_status;
  v_best public.load_status;
  v_best_kind text;
  v_best_src public.stop_time_source;
  v_type_label text;
BEGIN
  SELECT l.status, l.operator_id INTO v_status, v_operator
    FROM public.loads l WHERE l.id = NEW.load_id FOR UPDATE;
  IF v_status IS NULL THEN RETURN NULL; END IF;

  -- Forward only, and only from the pre-delivery statuses.
  IF NOT (v_status = ANY (ARRAY['available','covered','dispatched','in_transit','at_delivery']::public.load_status[])) THEN
    RETURN NULL;
  END IF;
  IF v_status = 'available' AND v_operator IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT s.id INTO v_last_delivery
    FROM public.load_stops s
   WHERE s.load_id = NEW.load_id AND s.stop_type = 'delivery'
   ORDER BY s.stop_sequence DESC
   LIMIT 1;
  v_is_last := (NEW.stop_type = 'delivery' AND v_last_delivery = NEW.id);

  FOREACH v_kind IN ARRAY ARRAY['arrival','departure'] LOOP
    IF v_kind = 'arrival' THEN
      CONTINUE WHEN NEW.actual_arrival_at IS NULL
                 OR NEW.actual_arrival_at IS NOT DISTINCT FROM OLD.actual_arrival_at;
      v_src := NEW.arrival_source;
    ELSE
      CONTINUE WHEN NEW.actual_departure_at IS NULL
                 OR NEW.actual_departure_at IS NOT DISTINCT FROM OLD.actual_departure_at;
      v_src := NEW.departure_source;
    END IF;

    IF NEW.stop_type = 'delivery' THEN
      IF v_is_last THEN
        v_target := CASE WHEN v_kind = 'arrival' THEN 'at_delivery' ELSE 'delivered' END;
      ELSE
        v_target := 'in_transit';
      END IF;
    ELSE -- pickup, drop_and_hook
      v_target := CASE WHEN v_kind = 'arrival' THEN 'dispatched' ELSE 'in_transit' END;
    END IF;

    IF v_best IS NULL OR array_position(v_seq, v_target) >= array_position(v_seq, v_best) THEN
      v_best := v_target; v_best_kind := v_kind; v_best_src := v_src;
    END IF;
  END LOOP;

  IF v_best IS NULL OR array_position(v_seq, v_best) <= array_position(v_seq, v_status) THEN
    RETURN NULL;
  END IF;

  v_type_label := CASE NEW.stop_type::text
    WHEN 'delivery' THEN 'delivery'
    WHEN 'drop_and_hook' THEN 'drop & hook'
    ELSE 'pickup' END;

  PERFORM set_config('superdrive.status_advance', 'on', true);
  PERFORM set_config('superdrive.status_change_source',
    CASE WHEN v_best_src = 'driver_app' THEN 'driver_app' ELSE 'staff_screen' END, true);
  PERFORM set_config('superdrive.status_change_note',
    format('Automatic: %s recorded at %s (stop %s)', v_best_kind, v_type_label, NEW.stop_sequence), true);

  UPDATE public.loads SET status = v_best WHERE id = NEW.load_id;

  PERFORM set_config('superdrive.status_advance', '', true);
  PERFORM set_config('superdrive.status_change_source', '', true);
  PERFORM set_config('superdrive.status_change_note', '', true);
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.advance_load_status_from_stop() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_load_stops_advance_load_status
AFTER UPDATE OF actual_arrival_at, actual_departure_at ON public.load_stops
FOR EACH ROW
WHEN ((NEW.actual_arrival_at IS NOT NULL AND NEW.actual_arrival_at IS DISTINCT FROM OLD.actual_arrival_at)
   OR (NEW.actual_departure_at IS NOT NULL AND NEW.actual_departure_at IS DISTINCT FROM OLD.actual_departure_at))
EXECUTE FUNCTION public.advance_load_status_from_stop();

-- The one history writer now also carries the transaction-local note.
CREATE OR REPLACE FUNCTION public.log_load_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_src text := nullif(current_setting('superdrive.status_change_source', true), '');
  v_note text := nullif(current_setting('superdrive.status_change_note', true), '');
BEGIN
  IF v_src IS NOT NULL AND v_src NOT IN ('staff_screen','driver_app','system') THEN
    RAISE EXCEPTION 'Unknown status change source: %', v_src USING ERRCODE = '22023';
  END IF;
  IF v_src IS NULL THEN
    IF v_uid IS NULL THEN
      v_src := 'system';
    ELSIF public.has_role(v_uid, 'dispatcher') OR public.has_role(v_uid, 'management')
       OR public.has_role(v_uid, 'owner') OR public.has_role(v_uid, 'onboarding_staff') THEN
      v_src := 'staff_screen';
    ELSIF public.has_role(v_uid, 'operator') THEN
      v_src := 'driver_app';
    ELSE
      v_src := 'system';
    END IF;
  END IF;

  INSERT INTO public.load_status_history (load_id, previous_status, new_status, changed_by, change_source, notes)
  VALUES (NEW.id, OLD.status, NEW.status,
          CASE WHEN v_uid IS NULL THEN NULL ELSE public.current_profile_id() END,
          v_src, v_note);
  RETURN NEW;
END;
$function$;

-- Driver guard: status passes ONLY while the stop-time path is running.
CREATE OR REPLACE FUNCTION public.enforce_loads_operator_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  allowed text[] := ARRAY['driver_accepted_at','driver_declined_at','driver_decline_reason','reefer_acknowledged_at','updated_at'];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner')
     OR public.has_role(auth.uid(), 'dispatcher') THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'operator') THEN
    IF coalesce(current_setting('superdrive.delivered_at_derive', true), '') = 'on' THEN
      allowed := allowed || ARRAY['delivered_at','delivered_at_source','delivered_at_by'];
    END IF;
    IF coalesce(current_setting('superdrive.status_advance', true), '') = 'on' THEN
      allowed := allowed || ARRAY['status'];
    END IF;
    IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
      RAISE EXCEPTION 'Operators may only update driver action fields on their loads';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
