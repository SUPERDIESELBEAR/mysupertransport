-- PEI follow-up cadence: company-wide settings + per-employer pause.
-- Additive only. Existing pei_requests behaviour is unchanged; the cadence
-- edge function already skips rows with a non-null auto_paused_reason.

CREATE TABLE IF NOT EXISTS public.pei_cadence_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  auto_follow_ups_enabled boolean NOT NULL DEFAULT true,
  follow_up_interval_days integer NOT NULL DEFAULT 5
    CHECK (follow_up_interval_days BETWEEN 1 AND 15),
  gfe_after_days integer NOT NULL DEFAULT 30
    CHECK (gfe_after_days BETWEEN 7 AND 60),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT pei_cadence_gfe_after_interval CHECK (gfe_after_days > follow_up_interval_days)
);

GRANT SELECT ON public.pei_cadence_settings TO authenticated;
GRANT ALL ON public.pei_cadence_settings TO service_role;

ALTER TABLE public.pei_cadence_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read pei cadence settings" ON public.pei_cadence_settings;
CREATE POLICY "staff read pei cadence settings"
  ON public.pei_cadence_settings
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'onboarding_staff')
  );

INSERT INTO public.pei_cadence_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

-- Writer: company-wide cadence settings ------------------------------------
CREATE OR REPLACE FUNCTION public.set_pei_cadence_settings(
  p_enabled boolean,
  p_interval_days integer,
  p_gfe_after_days integer,
  p_note text
)
RETURNS public.pei_cadence_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row public.pei_cadence_settings;
BEGIN
  IF v_actor IS NULL
     OR NOT (public.has_role(v_actor, 'owner') OR public.has_role(v_actor, 'management')) THEN
    RAISE EXCEPTION 'Not authorized to change PEI follow-up settings';
  END IF;
  IF p_note IS NULL OR btrim(p_note) = '' THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;
  IF p_interval_days IS NULL OR p_interval_days < 1 OR p_interval_days > 15 THEN
    RAISE EXCEPTION 'Follow-up interval must be between 1 and 15 days';
  END IF;
  IF p_gfe_after_days IS NULL OR p_gfe_after_days < 7 OR p_gfe_after_days > 60 THEN
    RAISE EXCEPTION 'Good Faith Effort day must be between 7 and 60';
  END IF;
  IF p_gfe_after_days <= p_interval_days THEN
    RAISE EXCEPTION 'Good Faith Effort day must be greater than the follow-up interval';
  END IF;

  UPDATE public.pei_cadence_settings
     SET auto_follow_ups_enabled = p_enabled,
         follow_up_interval_days = p_interval_days,
         gfe_after_days = p_gfe_after_days,
         updated_at = now(),
         updated_by = v_actor
   WHERE id = true
  RETURNING * INTO v_row;

  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_label, metadata)
  VALUES (
    v_actor,
    public._audit_actor_name(v_actor),
    'pei_cadence_settings_updated',
    'pei_cadence_settings',
    'PEI follow-up settings',
    jsonb_build_object(
      'enabled', p_enabled,
      'interval_days', p_interval_days,
      'gfe_after_days', p_gfe_after_days,
      'note', btrim(p_note)
    )
  );

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.set_pei_cadence_settings(boolean, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_pei_cadence_settings(boolean, integer, integer, text) TO authenticated, service_role;

-- Writer: per-employer pause / resume ---------------------------------------
CREATE OR REPLACE FUNCTION public.set_pei_request_auto_pause(
  p_request_id uuid,
  p_paused boolean,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_employer text;
  v_reason text;
BEGIN
  IF v_actor IS NULL
     OR NOT (public.has_role(v_actor, 'owner') OR public.has_role(v_actor, 'management')) THEN
    RAISE EXCEPTION 'Not authorized to pause PEI follow-ups';
  END IF;

  SELECT employer_name, auto_paused_reason INTO v_employer, v_reason
    FROM public.pei_requests WHERE id = p_request_id;
  IF v_employer IS NULL THEN
    RAISE EXCEPTION 'PEI request not found';
  END IF;

  IF p_paused THEN
    UPDATE public.pei_requests
       SET auto_paused_reason = 'staff_paused'
     WHERE id = p_request_id;
  ELSE
    -- Only a staff pause can be cleared here; a suppression stays in place.
    IF v_reason IS DISTINCT FROM 'staff_paused' THEN
      RAISE EXCEPTION 'This request was paused by the system and cannot be resumed here';
    END IF;
    UPDATE public.pei_requests
       SET auto_paused_reason = NULL
     WHERE id = p_request_id;
  END IF;

  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (
    v_actor,
    public._audit_actor_name(v_actor),
    CASE WHEN p_paused THEN 'pei_auto_follow_up_paused' ELSE 'pei_auto_follow_up_resumed' END,
    'pei_request',
    p_request_id,
    v_employer,
    jsonb_build_object('note', NULLIF(btrim(coalesce(p_note, '')), ''))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_pei_request_auto_pause(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_pei_request_auto_pause(uuid, boolean, text) TO authenticated, service_role;