-- Default privileges handed authenticated the full set on the new table. The
-- acceptance record has exactly ONE writer (accept_fuel_disagreement, a
-- SECURITY DEFINER running as owner); a direct client write would bypass the
-- role check, the required note and the disagreement precondition alike.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.fuel_disagreement_acceptances FROM authenticated;
REVOKE ALL ON public.fuel_disagreement_acceptances FROM anon, PUBLIC;
GRANT SELECT ON public.fuel_disagreement_acceptances TO authenticated;