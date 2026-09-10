-- ============================================================
-- 1. A PLATE THAT MOVED LEAVES A RECORD BEHIND
-- ------------------------------------------------------------
-- `onboarding_status.truck_plate` is overwritten in place, so when a plate
-- moves from one truck to another the previous holder simply loses it and
-- nobody can tell later whether the plate MOVED or was a typo. Seventeen
-- plates currently sit on more than one driver with no way to distinguish
-- the two cases. This table is that distinction.
--
-- Append-only in practice: staff read it, only the writer below inserts.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.truck_plate_history (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id       uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  unit_number       text,
  plate_number      text NOT NULL,
  plate_state       text,
  replaced_by_plate text,
  replaced_by_state text,
  action            text NOT NULL CHECK (action IN ('cleared', 'replaced')),
  reason            text NOT NULL,
  changed_by        uuid REFERENCES public.profiles(id),
  changed_by_name   text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_truck_plate_history_operator
  ON public.truck_plate_history(operator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_truck_plate_history_plate
  ON public.truck_plate_history(upper(btrim(plate_number)));

GRANT SELECT ON public.truck_plate_history TO authenticated;
GRANT ALL    ON public.truck_plate_history TO service_role;

ALTER TABLE public.truck_plate_history ENABLE ROW LEVEL SECURITY;

-- Staff read. Nobody writes directly -- the writer below is SECURITY DEFINER,
-- so there is deliberately no INSERT/UPDATE/DELETE policy for any client role.
DROP POLICY IF EXISTS "Staff can view plate history" ON public.truck_plate_history;
CREATE POLICY "Staff can view plate history"
ON public.truck_plate_history
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'management')
  OR public.has_role(auth.uid(), 'owner')
  OR public.has_role(auth.uid(), 'onboarding_staff')
);

-- ============================================================
-- 2. ONE DRIVER'S PLATE, CORRECTED BY A NAMED PERSON
-- ------------------------------------------------------------
-- Definer because it writes `onboarding_status`, which operators may only
-- touch through a narrow whitelist. Narrow in every direction: management or
-- owner checked IN THE BODY so definer rights buy no escalation, the actor
-- comes from current_profile_id() rather than an argument, a reason is
-- required, ONE operator per call with no bulk path, it writes truck_plate
-- and truck_plate_state and nothing else, it refuses a replacement plate that
-- would collide with another driver, and every call writes both a history row
-- and an audit entry.
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_shared_truck_plate(
  _operator_id uuid,
  _new_plate   text,
  _new_state   text,
  _reason      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_actor     uuid := public.current_profile_id();
  v_op        public.operators;
  v_unit      text;
  v_old_plate text;
  v_old_state text;
  v_plate     text := NULLIF(btrim(upper(COALESCE(_new_plate, ''))), '');
  v_state     text := NULLIF(btrim(upper(COALESCE(_new_state, ''))), '');
  v_reason    text := NULLIF(btrim(COALESCE(_reason, '')), '');
  v_action    text;
  v_clash     text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;

  SELECT * INTO v_op FROM public.operators o WHERE o.id = _operator_id;
  IF v_op.id IS NULL THEN
    RAISE EXCEPTION 'Driver not found';
  END IF;

  SELECT os.truck_plate, os.truck_plate_state, public.operator_unit_number(os.unit_number, v_op.unit_number)
    INTO v_old_plate, v_old_state, v_unit
  FROM public.onboarding_status os
  WHERE os.operator_id = v_op.id;

  IF NULLIF(btrim(COALESCE(v_old_plate, '')), '') IS NULL THEN
    RAISE EXCEPTION 'This driver has no plate on file';
  END IF;

  v_action := CASE WHEN v_plate IS NULL THEN 'cleared' ELSE 'replaced' END;

  -- A replacement must not simply move the duplicate somewhere else.
  IF v_plate IS NOT NULL THEN
    SELECT btrim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, ''))
      INTO v_clash
    FROM public.onboarding_status os2
    JOIN public.operators o2 ON o2.id = os2.operator_id
    LEFT JOIN public.profiles p ON p.user_id = o2.user_id
    WHERE os2.operator_id <> v_op.id
      AND regexp_replace(upper(COALESCE(os2.truck_plate, '')), '[^A-Z0-9]', '', 'g')
          = regexp_replace(v_plate, '[^A-Z0-9]', '', 'g')
      AND regexp_replace(upper(COALESCE(os2.truck_plate_state, '')), '[^A-Z0-9]', '', 'g')
          = regexp_replace(COALESCE(v_state, ''), '[^A-Z0-9]', '', 'g')
    LIMIT 1;

    IF v_clash IS NOT NULL THEN
      RAISE EXCEPTION 'Plate % is already on another driver (%)', v_plate, v_clash;
    END IF;
  END IF;

  UPDATE public.onboarding_status
     SET truck_plate       = v_plate,
         truck_plate_state = CASE WHEN v_plate IS NULL THEN NULL ELSE v_state END,
         updated_at        = now()
   WHERE operator_id = v_op.id;

  INSERT INTO public.truck_plate_history
    (operator_id, unit_number, plate_number, plate_state,
     replaced_by_plate, replaced_by_state, action, reason, changed_by, changed_by_name)
  VALUES
    (v_op.id, v_unit, v_old_plate, v_old_state,
     v_plate, CASE WHEN v_plate IS NULL THEN NULL ELSE v_state END,
     v_action, v_reason, v_actor, public._audit_actor_name(v_actor));

  INSERT INTO public.audit_log
    (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (
    v_actor,
    public._audit_actor_name(v_actor),
    'truck_plate_' || v_action,
    'onboarding_status',
    v_op.id,
    COALESCE('Unit ' || v_unit, 'Unit —') || ' — ' || v_old_plate,
    jsonb_build_object(
      'previous_plate', v_old_plate,
      'previous_plate_state', v_old_state,
      'new_plate', v_plate,
      'new_plate_state', v_state,
      'reason', v_reason,
      'source', 'duplicate plate review',
      'fields_written', 'onboarding_status.truck_plate, onboarding_status.truck_plate_state'
    )
  );

  RETURN jsonb_build_object(
    'operator_id', v_op.id,
    'action', v_action,
    'previous_plate', v_old_plate,
    'new_plate', v_plate,
    'changed_by', v_actor,
    'changed_at', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_shared_truck_plate(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_shared_truck_plate(uuid, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_shared_truck_plate(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_shared_truck_plate(uuid, text, text, text) TO service_role;