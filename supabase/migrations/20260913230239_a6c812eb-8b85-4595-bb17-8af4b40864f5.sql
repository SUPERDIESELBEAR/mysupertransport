-- GLOBAL uniqueness, stated deliberately: a USDOT number identifies a carrier
-- across all of FMCSA, so it is unique across companies, not per-company.
CREATE UNIQUE INDEX IF NOT EXISTS carrier_profile_usdot_unique
  ON public.carrier_profile (usdot_number);

CREATE OR REPLACE FUNCTION public.recompute_eld_extension_projection(p_event_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_tz text;
  v_usdot text;
  v_today date;
  v_req public.eld_extension_requests%ROWTYPE;
  v_first_filed timestamptz;
BEGIN
  -- TENANCY: the timezone must come from the company that OWNS this federal
  -- record, not from the first carrier row. The event carries the carrier
  -- identity snapshotted at creation (malfunctionCarrierSnapshot); USDOT is
  -- globally unique, so it resolves exactly one company.
  SELECT e.carrier_usdot INTO v_usdot
  FROM public.eld_malfunction_events e
  WHERE e.id = p_event_id;

  IF v_usdot IS NULL OR btrim(v_usdot) = '' THEN
    RAISE EXCEPTION 'Cannot resolve the carrier for ELD malfunction event % — no USDOT snapshot on the record. Refusing rather than defaulting to another company''s timezone.', p_event_id;
  END IF;

  SELECT c.home_terminal_timezone INTO v_tz
  FROM public.carrier_profile c
  WHERE c.usdot_number = btrim(v_usdot);

  -- FAIL CLOSED, matching the step-1 resolver: no COALESCE, no fallback
  -- carrier, no default timezone.
  IF v_tz IS NULL OR btrim(v_tz) = '' THEN
    RAISE EXCEPTION 'No carrier profile with USDOT % carries a home terminal timezone; refusing to project ELD extension dates for event %.', v_usdot, p_event_id;
  END IF;

  v_today := (now() AT TIME ZONE v_tz)::date;

  SELECT min(x.submitted_at) INTO v_first_filed
  FROM public.eld_extension_requests x
  WHERE x.event_id = p_event_id AND x.submitted_at IS NOT NULL;

  SELECT r.* INTO v_req
  FROM public.eld_extension_requests r
  WHERE r.event_id = p_event_id
    AND r.status = 'granted'
    AND r.granted_through >= v_today
  ORDER BY r.granted_through DESC, r.response_status_at DESC NULLS LAST
  LIMIT 1;

  UPDATE public.eld_malfunction_events e
  SET extension_requested_at = v_first_filed,
      extension_granted_at   = v_req.response_status_at,
      extension_granted_by   = v_req.responded_by,
      extension_expires_on   = v_req.granted_through,
      extension_notes        = CASE
        WHEN v_req.id IS NULL THEN NULL
        ELSE 'FMCSA response ' || to_char(v_req.response_date, 'YYYY-MM-DD')
             || COALESCE(' (ref ' || nullif(btrim(v_req.response_reference), '') || ')', '')
             || ': ' || v_req.response_notes
      END
  WHERE e.id = p_event_id
    AND (e.extension_requested_at, e.extension_granted_at, e.extension_granted_by,
         e.extension_expires_on)
        IS DISTINCT FROM
        (v_first_filed, v_req.response_status_at, v_req.responded_by, v_req.granted_through);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.recompute_eld_extension_projection(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_eld_extension_projection(uuid) TO service_role;