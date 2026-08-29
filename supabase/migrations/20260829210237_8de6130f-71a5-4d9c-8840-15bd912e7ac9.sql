-- The parked_by column keeps recording who parked the driver, but the foreign
-- key to profiles is dropped deliberately: it made operators -> profiles a
-- resolvable PostgREST embed, so any `operators(profiles(...))` shape would
-- silently return the PARKING ACTOR's name where the driver's own profile was
-- meant. Referential integrity for the actor lives on
-- operator_parking_events.changed_by, which is the audit trail of record.
ALTER TABLE public.operators DROP CONSTRAINT IF EXISTS operators_parked_by_fkey;