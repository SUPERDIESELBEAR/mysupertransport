ALTER TABLE public.operators
  ADD COLUMN IF NOT EXISTS fuel_discount_passthrough_override boolean;

COMMENT ON COLUMN public.operators.fuel_discount_passthrough_override IS
'Per-driver SETTING, not a policy override. Three states: NULL inherits pay_policies.fuel_discount_passthrough; TRUE passes the fuel discount through to this driver as its own credit line; FALSE explicitly does not, even if the company default later changes. Rates belong in pay policies; this is a switch. A driver-specific pay policy was REJECTED for this because it would clone the whole company policy to flip one boolean and detach the driver from every future company-wide rate change. Genuinely different rates per driver still require the pay_policy_assignments writer, which is separate recorded debt and is NOT this.';

CREATE OR REPLACE FUNCTION public.set_operator_fuel_discount_passthrough(
  _operator_id uuid,
  _value       boolean,
  _note        text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_op    public.operators;
  v_note  text := NULLIF(btrim(COALESCE(_note, '')), '');
BEGIN
  -- 1. actor server-side, never a parameter
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. management or owner, checked in the body
  IF NOT (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- 3. refuse-only contract: the driver must exist and a reason is required.
  SELECT * INTO v_op FROM public.operators o WHERE o.id = _operator_id;
  IF v_op.id IS NULL THEN
    RAISE EXCEPTION 'Driver not found';
  END IF;
  IF v_note IS NULL THEN
    RAISE EXCEPTION 'A note is required';
  END IF;

  -- 4. ONE column. This writer touches the switch and nothing else -- no rate,
  --    no pay policy, no other operator field.
  UPDATE public.operators
     SET fuel_discount_passthrough_override = _value,
         updated_at = now()
   WHERE id = v_op.id;

  INSERT INTO public.audit_log
    (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (
    v_actor,
    public._audit_actor_name(v_actor),
    'operator_fuel_discount_passthrough_set',
    'operators',
    v_op.id,
    CASE WHEN _value IS NULL THEN 'Fuel discount: inherit company setting'
         WHEN _value THEN 'Fuel discount: passed through'
         ELSE 'Fuel discount: not passed through' END,
    jsonb_build_object(
      'previous_value', to_jsonb(v_op.fuel_discount_passthrough_override),
      'new_value', to_jsonb(_value),
      'note', v_note,
      'field_written', 'operators.fuel_discount_passthrough_override'
    )
  );

  RETURN jsonb_build_object(
    'operator_id', v_op.id,
    'fuel_discount_passthrough_override', to_jsonb(_value),
    'set_by', v_actor,
    'set_at', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_operator_fuel_discount_passthrough(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_operator_fuel_discount_passthrough(uuid, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_operator_fuel_discount_passthrough(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_operator_fuel_discount_passthrough(uuid, boolean, text) TO service_role;