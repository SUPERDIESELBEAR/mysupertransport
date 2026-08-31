-- Module 4, Pass 2a: delivered_at gets a writer.

CREATE TYPE public.delivered_at_source AS ENUM ('stop_departure', 'dispatcher_entry');

ALTER TABLE public.loads
  ADD COLUMN delivered_at_source public.delivered_at_source,
  ADD COLUMN delivered_at_by uuid REFERENCES public.profiles(id);

-- Provenance is stamped by the database from the writer's context, exactly as
-- stamp_load_stop_time_source does. A client value is always overwritten.
CREATE OR REPLACE FUNCTION public.stamp_load_delivered_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_src public.delivered_at_source;
BEGIN
  v_src := coalesce(
    nullif(current_setting('superdrive.delivered_at_source', true), ''),
    'dispatcher_entry'
  )::public.delivered_at_source;

  IF TG_OP = 'INSERT' THEN
    IF NEW.delivered_at IS NULL THEN
      NEW.delivered_at_source := NULL;
      NEW.delivered_at_by := NULL;
    ELSE
      NEW.delivered_at_source := v_src;
      NEW.delivered_at_by := public.current_profile_id();
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.delivered_at IS DISTINCT FROM OLD.delivered_at THEN
    IF NEW.delivered_at IS NULL THEN
      NEW.delivered_at_source := NULL;
      NEW.delivered_at_by := NULL;
    ELSE
      NEW.delivered_at_source := v_src;
      NEW.delivered_at_by := public.current_profile_id();
    END IF;
  ELSE
    NEW.delivered_at_source := OLD.delivered_at_source;
    NEW.delivered_at_by := OLD.delivered_at_by;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.stamp_load_delivered_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stamp_load_delivered_at() FROM anon;
REVOKE ALL ON FUNCTION public.stamp_load_delivered_at() FROM authenticated;

DROP TRIGGER IF EXISTS stamp_load_delivered_at ON public.loads;
CREATE TRIGGER stamp_load_delivered_at
BEFORE INSERT OR UPDATE ON public.loads
FOR EACH ROW EXECUTE FUNCTION public.stamp_load_delivered_at();

-- The one writer: departure from the LAST delivery stop.
CREATE OR REPLACE FUNCTION public.derive_load_delivered_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_load uuid;
  v_last timestamptz;
  v_cur timestamptz;
  v_src public.delivered_at_source;
BEGIN
  v_load := coalesce(NEW.load_id, OLD.load_id);
  IF v_load IS NULL THEN RETURN NULL; END IF;

  SELECT s.actual_departure_at INTO v_last
    FROM public.load_stops s
   WHERE s.load_id = v_load
     AND s.stop_type = 'delivery'
   ORDER BY s.stop_sequence DESC
   LIMIT 1;

  SELECT l.delivered_at, l.delivered_at_source INTO v_cur, v_src
    FROM public.loads l WHERE l.id = v_load;

  -- No departure recorded: clear only what this path itself derived. A
  -- dispatcher's hand-entered instant is never wiped by a stop edit.
  IF v_last IS NULL THEN
    IF v_cur IS NOT NULL AND v_src = 'stop_departure' THEN
      PERFORM set_config('superdrive.delivered_at_derive', 'on', true);
      UPDATE public.loads SET delivered_at = NULL WHERE id = v_load;
      PERFORM set_config('superdrive.delivered_at_derive', 'off', true);
    END IF;
    RETURN NULL;
  END IF;

  IF v_cur IS DISTINCT FROM v_last THEN
    PERFORM set_config('superdrive.delivered_at_source', 'stop_departure', true);
    PERFORM set_config('superdrive.delivered_at_derive', 'on', true);
    UPDATE public.loads SET delivered_at = v_last WHERE id = v_load;
    PERFORM set_config('superdrive.delivered_at_derive', 'off', true);
    PERFORM set_config('superdrive.delivered_at_source', '', true);
  END IF;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.derive_load_delivered_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.derive_load_delivered_at() FROM anon;
REVOKE ALL ON FUNCTION public.derive_load_delivered_at() FROM authenticated;

DROP TRIGGER IF EXISTS derive_load_delivered_at ON public.load_stops;
CREATE TRIGGER derive_load_delivered_at
AFTER INSERT OR UPDATE OR DELETE ON public.load_stops
FOR EACH ROW EXECUTE FUNCTION public.derive_load_delivered_at();

-- A driver recording his own departure derives the load's delivery instant.
-- The operator column guard must let that one derived write through, and only
-- while the derive path is running.
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
    IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
      RAISE EXCEPTION 'Operators may only update driver action fields on their loads';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_loads_operator_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_loads_operator_update() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_loads_operator_update() FROM authenticated;

-- The fallback: dispatch enters the instant by hand. Provenance still comes
-- from the trigger, not from the caller.
CREATE OR REPLACE FUNCTION public.set_load_delivered_at(
  p_load_id uuid,
  p_delivered_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (public.has_role(v_uid, 'dispatcher')
          OR public.has_role(v_uid, 'management')
          OR public.has_role(v_uid, 'owner')) THEN
    RAISE EXCEPTION 'You do not have permission to set a delivery time';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.loads WHERE id = p_load_id) THEN
    RAISE EXCEPTION 'Load not found';
  END IF;
  IF p_delivered_at IS NOT NULL AND p_delivered_at > now() + interval '1 day' THEN
    RAISE EXCEPTION 'A delivery time cannot be in the future';
  END IF;

  PERFORM set_config('superdrive.delivered_at_source', 'dispatcher_entry', true);
  UPDATE public.loads SET delivered_at = p_delivered_at WHERE id = p_load_id;
  PERFORM set_config('superdrive.delivered_at_source', '', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.set_load_delivered_at(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_load_delivered_at(uuid, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_load_delivered_at(uuid, timestamptz) TO authenticated;