CREATE OR REPLACE FUNCTION public.search_retention_archive(_operator_ids uuid[] DEFAULT NULL::uuid[], _from date DEFAULT NULL::date, _to date DEFAULT NULL::date, _truck text DEFAULT NULL::text, _event_id uuid DEFAULT NULL::uuid, _status text DEFAULT NULL::text, _include_demo boolean DEFAULT false)
 RETURNS TABLE(artifact_type text, artifact_id uuid, operator_id uuid, log_date date, occurred_at timestamp with time zone, status text, label text, truck_number text, supersedes_day_id uuid, event_id uuid, storage_bucket text, storage_path text, is_demo boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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

  UNION ALL
  -- Revoked-list checks (§7). Fleet-level: no operator, no truck.
  SELECT 'eld_revoked_list_check'::text, k.id, NULL::uuid, k.checked_at::date, k.checked_at,
         k.result, 'Revoked-list check — ' || m.device_make || ' ' || m.device_model
           || ' (' || k.result || ')',
         NULL::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text,
         COALESCE(k.is_demo, false)
    FROM public.eld_revoked_list_checks k
    JOIN public.eld_device_models m ON m.id = k.eld_device_model_id
   WHERE (_include_demo OR COALESCE(k.is_demo, false) = false)
     AND (_from IS NULL OR k.checked_at::date >= _from)
     AND (_to IS NULL OR k.checked_at::date <= _to)
     AND (_status IS NULL OR k.result = _status)
     AND _operator_ids IS NULL AND _truck IS NULL AND _event_id IS NULL

  UNION ALL
  -- Divergences (§8): a certified day on the device that did not match the
  -- office copy, and how it was resolved. Part of the federal record because
  -- it explains why two copies of one log day differ.
  SELECT 'rods_divergence'::text, v.id, v.operator_id, v.log_date, v.detected_at,
         CASE WHEN v.acknowledged THEN 'resolved' ELSE 'open' END,
         'Divergence: ' || COALESCE(NULLIF(array_to_string(v.differing_fields, ', '), ''), 'row identity')
           || CASE WHEN v.acknowledged
                   THEN ' — resolved by ' || COALESCE(v.acknowledged_source, 'unknown')
                   ELSE ' — unresolved' END,
         d.truck_number, NULL::uuid, NULL::uuid, NULL::text, NULL::text,
         COALESCE(v.is_demo, false)
    FROM public.rods_divergences v
    LEFT JOIN public.rods_days d ON d.id = v.server_row_id
   WHERE (_include_demo OR COALESCE(v.is_demo, false) = false)
     AND (_operator_ids IS NULL OR v.operator_id = ANY(_operator_ids))
     AND (_from IS NULL OR v.log_date >= _from)
     AND (_to IS NULL OR v.log_date <= _to)
     AND (_truck IS NULL OR d.truck_number ILIKE '%' || _truck || '%')
     AND (_status IS NULL OR _status = CASE WHEN v.acknowledged THEN 'resolved' ELSE 'open' END)
     AND _event_id IS NULL

  ORDER BY 5 DESC NULLS LAST;
END;
$function$;

REVOKE ALL ON FUNCTION public.search_retention_archive(uuid[], date, date, text, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_retention_archive(uuid[], date, date, text, uuid, text, boolean) TO authenticated, service_role;