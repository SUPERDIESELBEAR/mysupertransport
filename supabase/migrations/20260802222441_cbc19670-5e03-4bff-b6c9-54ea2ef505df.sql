-- §6 Retention archive.

-- 1. Demo reachability: officer-packet share access has no operator link.
ALTER TABLE public.share_token_access_log
  ADD COLUMN IF NOT EXISTS operator_id uuid REFERENCES public.operators(id) ON DELETE SET NULL;

UPDATE public.share_token_access_log l
   SET operator_id = p.operator_id
  FROM public.officer_packet_links p
 WHERE p.token = l.token
   AND l.operator_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_share_token_access_log_operator
  ON public.share_token_access_log(operator_id, accessed_at DESC);

-- 2. Staff gate used by both readers.
CREATE OR REPLACE FUNCTION public.is_retention_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'management'::app_role)
      OR public.has_role(_user_id, 'owner'::app_role)
$$;

REVOKE EXECUTE ON FUNCTION public.is_retention_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_retention_admin(uuid) TO authenticated, service_role;

-- 3. Search. is_demo = false is the default predicate; demo is explicit opt-in.
CREATE OR REPLACE FUNCTION public.search_retention_archive(
  _operator_ids uuid[] DEFAULT NULL,
  _from date DEFAULT NULL,
  _to date DEFAULT NULL,
  _truck text DEFAULT NULL,
  _event_id uuid DEFAULT NULL,
  _status text DEFAULT NULL,
  _include_demo boolean DEFAULT false
)
RETURNS TABLE (
  artifact_type text,
  artifact_id uuid,
  operator_id uuid,
  log_date date,
  occurred_at timestamptz,
  status text,
  label text,
  truck_number text,
  supersedes_day_id uuid,
  event_id uuid,
  storage_bucket text,
  storage_path text,
  is_demo boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_retention_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to read the retention archive'
      USING ERRCODE = 'P0120';
  END IF;

  RETURN QUERY
  -- Records of duty status (every version; supersession order resolved client/server side).
  SELECT 'rods_day'::text, d.id, d.operator_id, d.log_date, d.certified_at,
         d.status::text,
         CASE WHEN d.supersedes_day_id IS NOT NULL THEN 'Amended log' ELSE 'Log' END,
         d.truck_number, d.supersedes_day_id, NULL::uuid,
         'rods-logs'::text, d.pdf_path, COALESCE(d.is_demo, false)
    FROM public.rods_days d
   WHERE (_include_demo OR COALESCE(d.is_demo, false) = false)
     AND (_operator_ids IS NULL OR d.operator_id = ANY(_operator_ids))
     AND (_from IS NULL OR d.log_date >= _from)
     AND (_to IS NULL OR d.log_date <= _to)
     AND (_truck IS NULL OR d.truck_number ILIKE '%' || _truck || '%')
     AND (_status IS NULL OR d.status::text = _status)
     AND _event_id IS NULL

  UNION ALL
  -- Amendment change records.
  SELECT 'rods_amendment'::text, a.id, a.operator_id, a.log_date, a.created_at,
         'recorded'::text, 'Amendment: ' || a.field_path,
         d.truck_number, a.original_day_id, NULL::uuid, NULL::text, NULL::text,
         COALESCE(d.is_demo, false)
    FROM public.rods_amendments a
    LEFT JOIN public.rods_days d ON d.id = a.rods_day_id
   WHERE (_include_demo OR COALESCE(d.is_demo, false) = false)
     AND (_operator_ids IS NULL OR a.operator_id = ANY(_operator_ids))
     AND (_from IS NULL OR a.log_date >= _from)
     AND (_to IS NULL OR a.log_date <= _to)
     AND (_truck IS NULL OR d.truck_number ILIKE '%' || _truck || '%')
     AND _status IS NULL AND _event_id IS NULL

  UNION ALL
  -- Authorized unlocks.
  SELECT 'rods_unlock_event'::text, u.id, u.operator_id, u.log_date, u.unlocked_at,
         'unlocked'::text, 'Authorized unlock',
         d.truck_number, u.rods_day_id, NULL::uuid, NULL::text, NULL::text,
         COALESCE(d.is_demo, o.is_demo, false)
    FROM public.rods_unlock_events u
    LEFT JOIN public.rods_days d ON d.id = u.rods_day_id
    LEFT JOIN public.operators o ON o.id = u.operator_id
   WHERE (_include_demo OR COALESCE(d.is_demo, o.is_demo, false) = false)
     AND (_operator_ids IS NULL OR u.operator_id = ANY(_operator_ids))
     AND (_from IS NULL OR u.log_date >= _from)
     AND (_to IS NULL OR u.log_date <= _to)
     AND (_truck IS NULL OR d.truck_number ILIKE '%' || _truck || '%')
     AND _status IS NULL AND _event_id IS NULL

  UNION ALL
  -- Correction requests.
  SELECT 'rods_correction_request'::text, c.id, c.operator_id, c.log_date, c.requested_at,
         c.status::text, 'Correction request',
         d.truck_number, c.rods_day_id, NULL::uuid, NULL::text, NULL::text,
         COALESCE(c.is_demo, false)
    FROM public.rods_correction_requests c
    LEFT JOIN public.rods_days d ON d.id = c.rods_day_id
   WHERE (_include_demo OR COALESCE(c.is_demo, false) = false)
     AND (_operator_ids IS NULL OR c.operator_id = ANY(_operator_ids))
     AND (_from IS NULL OR c.log_date >= _from)
     AND (_to IS NULL OR c.log_date <= _to)
     AND (_truck IS NULL OR d.truck_number ILIKE '%' || _truck || '%')
     AND (_status IS NULL OR c.status::text = _status)
     AND _event_id IS NULL

  UNION ALL
  -- Malfunction notices.
  SELECT 'eld_malfunction_event'::text, e.id, e.operator_id, e.discovered_at::date, e.discovered_at,
         e.status::text, 'Malfunction ' || COALESCE(e.malfunction_code, ''),
         NULL::text, NULL::uuid, e.id,
         'eld-notices'::text, e.notice_pdf_path, COALESCE(e.is_demo, false)
    FROM public.eld_malfunction_events e
   WHERE (_include_demo OR COALESCE(e.is_demo, false) = false)
     AND (_operator_ids IS NULL OR e.operator_id = ANY(_operator_ids))
     AND (_from IS NULL OR e.discovered_at::date >= _from)
     AND (_to IS NULL OR e.discovered_at::date <= _to)
     AND (_event_id IS NULL OR e.id = _event_id)
     AND (_status IS NULL OR e.status::text = _status)
     AND _truck IS NULL

  UNION ALL
  -- Extension requests and FMCSA responses.
  SELECT 'eld_extension_request'::text, x.id, x.operator_id, COALESCE(x.submitted_at, x.created_at)::date,
         COALESCE(x.submitted_at, x.created_at),
         x.status::text, 'FMCSA extension request',
         x.vehicle_unit_number, NULL::uuid, x.event_id,
         'eld-notices'::text, x.pdf_path, COALESCE(x.is_demo, false)
    FROM public.eld_extension_requests x
   WHERE (_include_demo OR COALESCE(x.is_demo, false) = false)
     AND (_operator_ids IS NULL OR x.operator_id = ANY(_operator_ids))
     AND (_from IS NULL OR COALESCE(x.submitted_at, x.created_at)::date >= _from)
     AND (_to IS NULL OR COALESCE(x.submitted_at, x.created_at)::date <= _to)
     AND (_event_id IS NULL OR x.event_id = _event_id)
     AND (_status IS NULL OR x.status::text = _status)
     AND (_truck IS NULL OR x.vehicle_unit_number ILIKE '%' || _truck || '%')

  UNION ALL
  -- Officer packet share-link access.
  SELECT 'share_token_access'::text, l.id, l.operator_id, l.accessed_at::date, l.accessed_at,
         l.outcome::text, 'Officer packet access',
         NULL::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text,
         COALESCE(o.is_demo, false)
    FROM public.share_token_access_log l
    JOIN public.operators o ON o.id = l.operator_id
   WHERE (_include_demo OR COALESCE(o.is_demo, false) = false)
     AND (_operator_ids IS NULL OR l.operator_id = ANY(_operator_ids))
     AND (_from IS NULL OR l.accessed_at::date >= _from)
     AND (_to IS NULL OR l.accessed_at::date <= _to)
     AND _status IS NULL AND _event_id IS NULL AND _truck IS NULL

  ORDER BY 5 DESC NULLS LAST;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.search_retention_archive(uuid[], date, date, text, uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_retention_archive(uuid[], date, date, text, uuid, text, boolean) TO authenticated, service_role;

-- 4. Per-event compliance timeline (§6.3).
CREATE OR REPLACE FUNCTION public.get_eld_compliance_timeline(_event_id uuid)
RETURNS TABLE (
  seq integer,
  occurred_at timestamptz,
  stage text,
  label text,
  detail text,
  artifact_type text,
  artifact_id uuid,
  storage_bucket text,
  storage_path text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ev public.eld_malfunction_events%ROWTYPE;
BEGIN
  IF NOT public.is_retention_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to read the compliance timeline'
      USING ERRCODE = 'P0120';
  END IF;

  SELECT * INTO ev FROM public.eld_malfunction_events WHERE id = _event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Malfunction event not found' USING ERRCODE = 'P0121';
  END IF;

  RETURN QUERY
  WITH stages AS (
    SELECT 10 AS seq, ev.discovered_at AS occurred_at, 'discovered'::text AS stage,
           'Malfunction discovered'::text AS label,
           COALESCE(ev.malfunction_code, '') || COALESCE(' — ' || ev.malfunction_description, '') AS detail,
           'eld_malfunction_event'::text AS artifact_type, ev.id AS artifact_id,
           NULL::text AS storage_bucket, NULL::text AS storage_path
    UNION ALL
    SELECT 20, ev.notice_generated_at, 'notice_generated', 'Malfunction notice generated', NULL,
           'eld_malfunction_event', ev.id, 'eld-notices', ev.notice_pdf_path
    UNION ALL
    SELECT 30, ev.notice_uploaded_at, 'notice_uploaded', 'Notice uploaded', NULL,
           'eld_malfunction_event', ev.id, 'eld-notices', ev.notice_pdf_path
    UNION ALL
    SELECT 40, ev.notice_sent_at, 'notice_sent', 'Notice sent to carrier', NULL,
           'eld_malfunction_event', ev.id, NULL, NULL
    UNION ALL
    SELECT 50, ev.carrier_acknowledged_at, 'carrier_acknowledged', 'Carrier acknowledged', NULL,
           'eld_malfunction_event', ev.id, NULL, NULL
    UNION ALL
    SELECT 60, d.certified_at, 'day_certified',
           'Log certified for ' || to_char(d.log_date, 'YYYY-MM-DD'),
           CASE WHEN d.supersedes_day_id IS NOT NULL
                THEN 'Amended version — ' || COALESCE(d.amendment_reason, 'no reason recorded')
                ELSE NULL END,
           'rods_day', d.id, 'rods-logs', d.pdf_path
      FROM public.rods_days d
     WHERE d.operator_id = ev.operator_id
       AND d.log_date >= ev.discovered_at::date
       AND (ev.resolved_at IS NULL OR d.log_date <= ev.resolved_at::date)
    UNION ALL
    SELECT 61, a.created_at, 'amendment',
           'Amendment to ' || to_char(a.log_date, 'YYYY-MM-DD'),
           a.field_path || ': ' || COALESCE(a.old_value, '—') || ' -> ' || COALESCE(a.new_value, '—')
             || ' (' || COALESCE(a.reason, 'no reason recorded') || ')',
           'rods_amendment', a.id, NULL, NULL
      FROM public.rods_amendments a
     WHERE a.operator_id = ev.operator_id
       AND a.log_date >= ev.discovered_at::date
       AND (ev.resolved_at IS NULL OR a.log_date <= ev.resolved_at::date)
    UNION ALL
    SELECT 70, u.unlocked_at, 'unlock',
           'Authorized unlock for ' || to_char(u.log_date, 'YYYY-MM-DD'),
           u.reason, 'rods_unlock_event', u.id, NULL, NULL
      FROM public.rods_unlock_events u
     WHERE u.operator_id = ev.operator_id
       AND u.log_date >= ev.discovered_at::date
       AND (ev.resolved_at IS NULL OR u.log_date <= ev.resolved_at::date)
    UNION ALL
    SELECT 80, x.submitted_at, 'extension_filed', 'FMCSA extension request filed',
           'Requested through ' || COALESCE(to_char(x.requested_through, 'YYYY-MM-DD'), '—'),
           'eld_extension_request', x.id, 'eld-notices', x.pdf_path
      FROM public.eld_extension_requests x
     WHERE x.event_id = ev.id AND x.submitted_at IS NOT NULL
    UNION ALL
    SELECT 90, x.response_status_at, 'fmcsa_response',
           'FMCSA response: ' || x.status,
           COALESCE(x.response_notes, '') ||
             COALESCE(' (through ' || to_char(x.granted_through, 'YYYY-MM-DD') || ')', ''),
           'eld_extension_request', x.id, NULL, NULL
      FROM public.eld_extension_requests x
     WHERE x.event_id = ev.id AND x.response_status_at IS NOT NULL
    UNION ALL
    SELECT 100, ev.resolved_at, 'resolved', 'Malfunction resolved', ev.resolution_notes,
           'eld_malfunction_event', ev.id, NULL, NULL
  )
  SELECT s.seq, s.occurred_at, s.stage, s.label, s.detail, s.artifact_type, s.artifact_id,
         s.storage_bucket, s.storage_path
    FROM stages s
   WHERE s.occurred_at IS NOT NULL
   ORDER BY s.occurred_at, s.seq;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_eld_compliance_timeline(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_eld_compliance_timeline(uuid) TO authenticated, service_role;

-- 5. Audited export record. Written before bytes are returned.
CREATE OR REPLACE FUNCTION public.record_retention_export(
  _kind text,
  _operator_ids uuid[],
  _from date,
  _to date,
  _include_demo boolean,
  _artifact_count integer,
  _parts integer,
  _label text,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.is_retention_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to export the retention archive'
      USING ERRCODE = 'P0120';
  END IF;
  IF _kind NOT IN ('rods_retention_export', 'eld_compliance_timeline_export') THEN
    RAISE EXCEPTION 'Unknown export kind %', _kind USING ERRCODE = 'P0122';
  END IF;

  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (
    auth.uid(),
    public._audit_actor_name(auth.uid()),
    _kind,
    'retention_archive',
    NULL,
    _label,
    COALESCE(_metadata, '{}'::jsonb) || jsonb_build_object(
      'operator_ids', COALESCE(to_jsonb(_operator_ids), 'null'::jsonb),
      'date_from', _from,
      'date_to', _to,
      'include_demo', COALESCE(_include_demo, false),
      'artifact_count', _artifact_count,
      'parts', _parts,
      'exported_at', now()
    )
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_retention_export(text, uuid[], date, date, boolean, integer, integer, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_retention_export(text, uuid[], date, date, boolean, integer, integer, text, jsonb) TO authenticated, service_role;