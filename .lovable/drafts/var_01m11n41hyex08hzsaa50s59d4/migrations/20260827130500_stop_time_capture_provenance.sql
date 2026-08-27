-- Module 5, Pass 1 — stop arrival/departure capture provenance.
--
-- load_stops already carried actual_arrival_at / actual_departure_at and their
-- coordinates, and the operator-update trigger already permitted an operator to
-- write exactly those. What was missing was any record of HOW a time was
-- captured. A driver's phone at the gate and a dispatcher typing what the driver
-- remembered are different kinds of evidence in a broker dispute, and the
-- timestamp alone cannot tell them apart.
--
-- The source is DERIVED FROM THE WRITER'S ROLE by trigger, never accepted from
-- the client, so an operator cannot claim a stronger provenance than they have
-- and the driver app needs no extra work when it lands in Module 11.

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

-- ACTOR STAMPING: current_profile_id(), never auth.uid(). These columns are
-- foreign keys to profiles(id); auth.uid() is the auth user id and writing one
-- where the other is required raises 23503. See actor-stamp-fk.test.ts.
CREATE OR REPLACE FUNCTION public.stamp_load_stop_time_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Arrival and departure stamp INDEPENDENTLY: a driver may have arrived hours
  -- before anyone knows when he left, and setting one must not touch the other.
  IF NEW.actual_arrival_at IS DISTINCT FROM OLD.actual_arrival_at THEN
    IF NEW.actual_arrival_at IS NULL THEN
      NEW.arrival_source := NULL;
      NEW.arrival_recorded_by := NULL;
    ELSE
      -- A correction RE-STAMPS. The current value is the corrector's, and the
      -- board must not present it as if a driver's phone produced it.
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

-- Trigger NAME ORDER MATTERS. Postgres fires BEFORE UPDATE triggers in
-- alphabetical order, so enforce_load_stops_operator_update_trg (e) runs before
-- stamp_load_stop_time_source_trg (s). If the stamp ran first it would add
-- changes outside the operator `allowed` array and the enforce trigger would
-- reject every legitimate driver check-in.
DROP TRIGGER IF EXISTS stamp_load_stop_time_source_trg ON public.load_stops;
CREATE TRIGGER stamp_load_stop_time_source_trg
  BEFORE UPDATE ON public.load_stops
  FOR EACH ROW EXECUTE FUNCTION public.stamp_load_stop_time_source();
