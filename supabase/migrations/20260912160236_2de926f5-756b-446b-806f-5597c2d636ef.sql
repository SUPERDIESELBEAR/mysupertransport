CREATE OR REPLACE FUNCTION public.enforce_lease_termination_void()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor uuid;
  v_actor_name text;
  v_driver text;
BEGIN
  -- A void is a legal withdrawal of a signed document. It carries a reason and
  -- an actor or it does not happen. The actor is resolved SERVER-SIDE and any
  -- value the client sent in voided_by is discarded.
  IF NEW.void_reason IS NULL OR btrim(NEW.void_reason) = '' THEN
    RAISE EXCEPTION 'A lease termination cannot be voided without a written reason.'
      USING ERRCODE = '23514';
  END IF;

  v_actor := public.current_profile_id();

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'A lease termination void requires an identified actor; no profile could be resolved for the current session.'
      USING ERRCODE = '42501';
  END IF;

  NEW.voided_by := v_actor;

  SELECT nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '')
    INTO v_actor_name
    FROM public.profiles p
   WHERE p.id = v_actor;

  SELECT nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '')
    INTO v_driver
    FROM public.operators o
    JOIN public.profiles p ON p.user_id = o.user_id
   WHERE o.id = NEW.operator_id;

  INSERT INTO public.audit_log (
    actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata
  ) VALUES (
    v_actor,
    v_actor_name,
    'lease_termination_voided',
    'operator',
    NEW.operator_id,
    coalesce(v_driver, NEW.contractor_label, NEW.operator_id::text),
    jsonb_build_object(
      'termination_id', NEW.id::text,
      'effective_date', NEW.effective_date,
      'reason', NEW.reason,
      'truck_vin', NEW.truck_vin,
      'void_reason', NEW.void_reason,
      'mechanism', 'enforce_lease_termination_void'
    )
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_lease_termination_void() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_lease_termination_void() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_lease_termination_void() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_lease_termination_void() TO service_role;

COMMENT ON FUNCTION public.enforce_lease_termination_void() IS
  'BEFORE UPDATE trigger guard on lease_terminations, firing only when voided_at moves from null to a value. Requires a non-blank void_reason, stamps voided_by from current_profile_id() and never from the client payload, writes the lease_termination_voided audit row, and REFUSES the void when no profile can be resolved for the session. Stamping null would reproduce the 2026-09-10 unattributable void this guard exists to prevent; a trigger rather than a function guard because the table RLS is a single ALL policy on is_staff(auth.uid()), so direct client writes must be covered too.';

DROP TRIGGER IF EXISTS enforce_lease_termination_void ON public.lease_terminations;
CREATE TRIGGER enforce_lease_termination_void
  BEFORE UPDATE ON public.lease_terminations
  FOR EACH ROW
  WHEN (OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL)
  EXECUTE FUNCTION public.enforce_lease_termination_void();