-- Module 5, Pass 1 — stop arrival/departure capture provenance.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stop_time_source') THEN
    CREATE TYPE public.stop_time_source AS ENUM ('driver_app', 'dispatcher_entry');
  END IF;
END $$;

ALTER TABLE public.load_stops
  ADD COLUMN IF NOT EXISTS arrival_source public.stop_time_source,
  ADD COLUMN IF NOT EXISTS departure_source public.stop_time_source,
  ADD COLUMN IF NOT EXISTS arrival_recorded_by uuid,
  ADD COLUMN IF NOT EXISTS departure_recorded_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'load_stops_arrival_recorded_by_fkey'
  ) THEN
    ALTER TABLE public.load_stops
      ADD CONSTRAINT load_stops_arrival_recorded_by_fkey
      FOREIGN KEY (arrival_recorded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'load_stops_departure_recorded_by_fkey'
  ) THEN
    ALTER TABLE public.load_stops
      ADD CONSTRAINT load_stops_departure_recorded_by_fkey
      FOREIGN KEY (departure_recorded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.stamp_load_stop_time_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_profile uuid;
  v_source public.stop_time_source;
BEGIN
  v_profile := public.current_profile_id();

  IF auth.uid() IS NOT NULL
     AND public.has_role(auth.uid(), 'operator')
     AND NOT (
       public.has_role(auth.uid(), 'dispatcher')
       OR public.has_role(auth.uid(), 'management')
       OR public.has_role(auth.uid(), 'owner')
     )
  THEN
    v_source := 'driver_app';
  ELSE
    v_source := 'dispatcher_entry';
  END IF;

  IF NEW.actual_arrival_at IS DISTINCT FROM OLD.actual_arrival_at THEN
    IF NEW.actual_arrival_at IS NULL THEN
      NEW.arrival_source := NULL;
      NEW.arrival_recorded_by := NULL;
    ELSE
      NEW.arrival_source := v_source;
      NEW.arrival_recorded_by := v_profile;
    END IF;
  END IF;

  IF NEW.actual_departure_at IS DISTINCT FROM OLD.actual_departure_at THEN
    IF NEW.actual_departure_at IS NULL THEN
      NEW.departure_source := NULL;
      NEW.departure_recorded_by := NULL;
    ELSE
      NEW.departure_source := v_source;
      NEW.departure_recorded_by := v_profile;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.stamp_load_stop_time_source() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS stamp_load_stop_time_source_trg ON public.load_stops;
CREATE TRIGGER stamp_load_stop_time_source_trg
  BEFORE UPDATE ON public.load_stops
  FOR EACH ROW EXECUTE FUNCTION public.stamp_load_stop_time_source();