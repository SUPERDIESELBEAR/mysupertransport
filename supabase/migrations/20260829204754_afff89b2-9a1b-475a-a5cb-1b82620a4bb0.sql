CREATE TYPE public.operator_parked_reason AS ENUM ('truck_down','vacation','personal_time_off','medical','other');

ALTER TABLE public.operators
  ADD COLUMN is_parked boolean NOT NULL DEFAULT false,
  ADD COLUMN parked_reason public.operator_parked_reason,
  ADD COLUMN parked_note text,
  ADD COLUMN parked_expected_return date,
  ADD COLUMN parked_at timestamptz,
  ADD COLUMN parked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE TABLE public.operator_parking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('parked','unparked')),
  reason public.operator_parked_reason,
  note text,
  expected_return date,
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_operator_parking_events_operator ON public.operator_parking_events(operator_id);
CREATE INDEX idx_operator_parking_events_changed_at ON public.operator_parking_events(changed_at DESC);

GRANT SELECT ON public.operator_parking_events TO authenticated;
GRANT ALL ON public.operator_parking_events TO service_role;

ALTER TABLE public.operator_parking_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view parking events"
ON public.operator_parking_events
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'dispatcher')
  OR public.has_role(auth.uid(), 'management')
  OR public.has_role(auth.uid(), 'owner')
  OR public.has_role(auth.uid(), 'onboarding_staff')
);

CREATE OR REPLACE FUNCTION public.set_operator_parked(
  _operator_id uuid,
  _reason public.operator_parked_reason,
  _note text DEFAULT NULL,
  _expected_return date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
DECLARE
  _actor uuid;
  _event_id uuid;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'dispatcher')
    OR public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
  ) THEN
    RAISE EXCEPTION 'Not authorised to park drivers' USING ERRCODE = '42501';
  END IF;

  IF _reason IS NULL THEN
    RAISE EXCEPTION 'A parking reason is required' USING ERRCODE = '23514';
  END IF;

  _actor := public.current_profile_id();

  UPDATE public.operators
     SET is_parked = true,
         parked_reason = _reason,
         parked_note = NULLIF(btrim(coalesce(_note,'')), ''),
         parked_expected_return = _expected_return,
         parked_at = now(),
         parked_by = _actor
   WHERE id = _operator_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operator not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.operator_parking_events (operator_id, action, reason, note, expected_return, changed_by)
  VALUES (_operator_id, 'parked', _reason, NULLIF(btrim(coalesce(_note,'')), ''), _expected_return, _actor)
  RETURNING id INTO _event_id;

  RETURN _event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_operator_parked(uuid, public.operator_parked_reason, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_operator_parked(uuid, public.operator_parked_reason, text, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_operator_parked(uuid, public.operator_parked_reason, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_operator_parked(uuid, public.operator_parked_reason, text, date) TO service_role;

CREATE OR REPLACE FUNCTION public.clear_operator_parked(
  _operator_id uuid,
  _note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
DECLARE
  _actor uuid;
  _event_id uuid;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'dispatcher')
    OR public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
  ) THEN
    RAISE EXCEPTION 'Not authorised to unpark drivers' USING ERRCODE = '42501';
  END IF;

  _actor := public.current_profile_id();

  UPDATE public.operators
     SET is_parked = false,
         parked_reason = NULL,
         parked_note = NULL,
         parked_expected_return = NULL,
         parked_at = NULL,
         parked_by = NULL
   WHERE id = _operator_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operator not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.operator_parking_events (operator_id, action, note, changed_by)
  VALUES (_operator_id, 'unparked', NULLIF(btrim(coalesce(_note,'')), ''), _actor)
  RETURNING id INTO _event_id;

  RETURN _event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_operator_parked(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_operator_parked(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.clear_operator_parked(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_operator_parked(uuid, text) TO service_role;