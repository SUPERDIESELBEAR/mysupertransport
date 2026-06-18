
ALTER TABLE public.driver_documents
  ADD COLUMN IF NOT EXISTS blocks_go_live boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.unacked_go_live_blockers(_operator_id uuid)
RETURNS TABLE (document_id uuid, title text, version int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.id, d.title, d.version
  FROM public.driver_documents d
  JOIN public.operators o ON o.id = _operator_id
  WHERE d.blocks_go_live = true
    AND d.is_visible = true
    AND o.user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.document_acknowledgments a
      WHERE a.document_id = d.id
        AND a.user_id = o.user_id
        AND a.document_version >= d.version
    )
  ORDER BY d.sort_order, d.title;
$$;

GRANT EXECUTE ON FUNCTION public.unacked_go_live_blockers(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_go_live_ack_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _unacked int;
  _is_owner boolean;
  _override boolean := COALESCE(current_setting('app.go_live_override', true) = 'true', false);
BEGIN
  IF NEW.go_live_date IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.go_live_date IS NOT NULL AND OLD.go_live_date = NEW.go_live_date THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO _unacked FROM public.unacked_go_live_blockers(NEW.operator_id);
  IF _unacked = 0 THEN RETURN NEW; END IF;

  SELECT public.has_role(auth.uid(), 'owner'::app_role) INTO _is_owner;
  IF _is_owner AND _override THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Cannot set Go Live: driver has % unacknowledged required document(s).', _unacked
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_go_live_ack_gate ON public.onboarding_status;
CREATE TRIGGER trg_enforce_go_live_ack_gate
  BEFORE INSERT OR UPDATE OF go_live_date ON public.onboarding_status
  FOR EACH ROW EXECUTE FUNCTION public.enforce_go_live_ack_gate();

-- Atomic owner override RPC: sets the session flag and updates go_live_date in one transaction.
CREATE OR REPLACE FUNCTION public.set_go_live_with_override(
  _operator_id uuid,
  _go_live_date date,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _bypassed jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner'::app_role) THEN
    RAISE EXCEPTION 'Only owners can override the Go Live gate' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', document_id, 'title', title)), '[]'::jsonb)
    INTO _bypassed
    FROM public.unacked_go_live_blockers(_operator_id);

  PERFORM set_config('app.go_live_override', 'true', true);

  UPDATE public.onboarding_status
    SET go_live_date = _go_live_date
    WHERE operator_id = _operator_id;

  INSERT INTO public.audit_log (actor_id, action, target_type, target_id, payload)
  VALUES (
    auth.uid(),
    'go_live_override',
    'operator',
    _operator_id,
    jsonb_build_object(
      'go_live_date', _go_live_date,
      'reason', _reason,
      'bypassed_documents', _bypassed
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_go_live_with_override(uuid, date, text) TO authenticated;
