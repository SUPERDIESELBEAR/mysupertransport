-- ============================================================
-- 1. ONE DEFINITION OF "THIS DRIVER'S UNIT NUMBER"
-- ------------------------------------------------------------
-- `fuel_resolve_card` resolved onboarding-then-operator inline while the
-- driver detail screen, My Fuel and the fuel PDF read `operators.unit_number`
-- alone. Same driver, same question, two answers: Ali Mohamed matched with NO
-- disagreement (onboarding holds 260, the file says 260) AND printed a blank
-- PDF header (the operator record is empty). Both readers were right about
-- what they read. The expression is extracted here so there is exactly one.
--
-- ORDER IS PRESERVED, NOT REVISITED. Onboarding first is what 48 of 60 active
-- drivers currently depend on; changing it is a separate decision recorded as
-- an open question in docs/tms-build-status.md.
-- ============================================================
CREATE OR REPLACE FUNCTION public.operator_unit_number(
  _onboarding_unit text,
  _operator_unit   text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT COALESCE(
    NULLIF(btrim(COALESCE(_onboarding_unit, '')), ''),
    NULLIF(btrim(COALESCE(_operator_unit, '')), '')
  );
$function$;

REVOKE ALL ON FUNCTION public.operator_unit_number(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.operator_unit_number(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.operator_unit_number(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.operator_unit_number(text, text) TO service_role;

-- The matcher now CALLS the rule instead of restating it. Card semantics,
-- the date window, the ordering and the LIMIT are byte-for-byte unchanged.
CREATE OR REPLACE FUNCTION public.fuel_resolve_card(_card_no text, _on_date date)
 RETURNS TABLE(operator_id uuid, equipment_id uuid, unit_number text, driver_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT o.id,
         ei.id,
         public.operator_unit_number(os.unit_number, o.unit_number),
         btrim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, ''))
  FROM public.equipment_items ei
  JOIN public.equipment_assignments ea ON ea.equipment_id = ei.id
  JOIN public.operators o ON o.id = ea.operator_id
  LEFT JOIN public.onboarding_status os ON os.operator_id = o.id
  LEFT JOIN public.profiles p ON p.user_id = o.user_id
  WHERE ei.device_type = 'fuel_card'
    AND upper(btrim(ei.serial_number)) = upper(btrim(COALESCE(_card_no, '')))
    AND ea.assigned_at::date <= _on_date
    AND (ea.returned_at IS NULL OR ea.returned_at::date >= _on_date)
  ORDER BY ea.assigned_at DESC
  LIMIT 1;
$function$;

-- ============================================================
-- 2. A HUMAN FILLS IN A MISSING UNIT. THE FILE DOES NOT.
-- ------------------------------------------------------------
-- The standing decision stands: a fuel FILE must never write to equipment or
-- operator records, because that makes MultiService authoritative over
-- SUPERTRANSPORT's own data. This is not that. The file PROMPTED the question;
-- a named person answered it. One operator at a time, explicitly confirmed,
-- never automatic, never bulk.
--
-- IT WRITES THE UNIT AND NOTHING ELSE. Not the card, not the driver name, not
-- anything else the file happens to carry.
--
-- IT WRITES THE OPERATOR RECORD, not the onboarding record: `onboarding_status`
-- describes a STAGE in a driver's lifecycle, `operators` is the durable record
-- of the driver. A unit number is a durable fact about his equipment.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_operator_unit_from_fuel_review(
  _operator_id uuid,
  _unit_no     text,
  _note        text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_actor    uuid := public.current_profile_id();
  v_op       public.operators;
  v_onb_unit text;
  v_existing text;
  v_unit     text := NULLIF(btrim(COALESCE(_unit_no, '')), '');
  v_note     text := NULLIF(btrim(COALESCE(_note, '')), '');
BEGIN
  -- 1. actor server-side, never a parameter
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. management or owner, checked in the body
  IF NOT (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- 3. refuse-only contract
  SELECT * INTO v_op FROM public.operators o WHERE o.id = _operator_id;
  IF v_op.id IS NULL THEN
    RAISE EXCEPTION 'Driver not found';
  END IF;
  IF v_unit IS NULL THEN
    RAISE EXCEPTION 'A unit number is required';
  END IF;
  IF v_note IS NULL THEN
    RAISE EXCEPTION 'A note is required';
  END IF;

  SELECT os.unit_number INTO v_onb_unit
  FROM public.onboarding_status os WHERE os.operator_id = v_op.id;

  -- FILL AN ABSENCE, NEVER OVERWRITE A VALUE. A unit already on file is a
  -- disagreement to be judged, not a blank to be completed.
  v_existing := public.operator_unit_number(v_onb_unit, v_op.unit_number);
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'This driver already has unit % on file; this action only fills a missing unit', v_existing;
  END IF;

  UPDATE public.operators
     SET unit_number = v_unit,
         updated_at  = now()
   WHERE id = v_op.id;

  INSERT INTO public.audit_log
    (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (
    v_actor,
    public._audit_actor_name(v_actor),
    'operator_unit_set_from_fuel_review',
    'operators',
    v_op.id,
    'Unit ' || v_unit,
    jsonb_build_object(
      'unit_number', v_unit,
      'previous_unit_number', NULL,
      'note', v_note,
      'source', 'fuel file review',
      'field_written', 'operators.unit_number'
    )
  );

  RETURN jsonb_build_object(
    'operator_id', v_op.id,
    'unit_number', v_unit,
    'set_by', v_actor,
    'set_at', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_operator_unit_from_fuel_review(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_operator_unit_from_fuel_review(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_operator_unit_from_fuel_review(uuid, text, text) TO authenticated;