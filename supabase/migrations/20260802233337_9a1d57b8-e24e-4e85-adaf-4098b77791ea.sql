-- §7 Revoked-list verification.
-- 49 CFR 395.8(a)(1): the carrier must run a device that is self-certified and
-- registered on FMCSA's list. FMCSA publishes no stable API, so the check is a
-- human reading the published lists; a scraper that silently broke would
-- produce false confidence, which is worse than no check at all.

CREATE TABLE public.eld_revoked_list_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  eld_device_model_id uuid NOT NULL REFERENCES public.eld_device_models(id) ON DELETE CASCADE,
  checked_by uuid,
  checked_at timestamptz NOT NULL DEFAULT now(),
  result text NOT NULL CHECK (result IN ('registered', 'revoked', 'not_found')),
  fmcsa_list_date date,
  notes text,
  -- Captured only on a revoked outcome. The grace period is set per
  -- revocation, not fixed by regulation, so the deadline is editable at
  -- capture time and merely defaults to +60 days in the UI.
  revocation_date date,
  replacement_deadline date,
  -- Device models are fleet-level, never operator-level, so a check is never a
  -- demo artifact. The column exists for archive parity and is always false.
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_eld_revoked_list_checks_model
  ON public.eld_revoked_list_checks (eld_device_model_id, checked_at DESC);

GRANT SELECT, INSERT ON public.eld_revoked_list_checks TO authenticated;
GRANT ALL ON public.eld_revoked_list_checks TO service_role;

ALTER TABLE public.eld_revoked_list_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "revoked_list_checks_select_staff"
  ON public.eld_revoked_list_checks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "revoked_list_checks_insert_staff"
  ON public.eld_revoked_list_checks FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

-- Append-only. A check is a compliance record: a wrong entry is corrected by
-- recording a new check, never by rewriting the old one.
CREATE OR REPLACE FUNCTION public.enforce_revoked_list_check_append_only()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RAISE EXCEPTION 'Revoked-list checks are append-only; record a new check instead'
    USING ERRCODE = 'P0130';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.enforce_revoked_list_check_append_only() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_revoked_list_check_append_only() TO service_role;

CREATE TRIGGER trg_revoked_list_checks_no_update
  BEFORE UPDATE ON public.eld_revoked_list_checks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_revoked_list_check_append_only();

CREATE TRIGGER trg_revoked_list_checks_no_delete
  BEFORE DELETE ON public.eld_revoked_list_checks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_revoked_list_check_append_only();

-- Denormalized status, written only by record_revoked_list_check.
ALTER TABLE public.eld_device_models
  ADD COLUMN last_check_at timestamptz,
  ADD COLUMN last_check_result text,
  ADD COLUMN last_check_id uuid,
  ADD COLUMN fmcsa_list_date date,
  ADD COLUMN revocation_date date,
  ADD COLUMN replacement_deadline date;

CREATE OR REPLACE FUNCTION public.record_revoked_list_check(
  _model_id uuid,
  _result text,
  _fmcsa_list_date date DEFAULT NULL,
  _notes text DEFAULT NULL,
  _revocation_date date DEFAULT NULL,
  _replacement_deadline date DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _uid uuid := auth.uid();
  _check_id uuid;
  _model record;
  _trucks int;
  _staff uuid;
BEGIN
  IF _uid IS NULL
     OR NOT (public.has_role(_uid, 'management') OR public.has_role(_uid, 'owner')) THEN
    RAISE EXCEPTION 'Not authorized to record a revoked-list check'
      USING ERRCODE = 'P0131';
  END IF;

  IF _result IS NULL OR _result NOT IN ('registered', 'revoked', 'not_found') THEN
    RAISE EXCEPTION 'A revoked-list check needs an explicit outcome'
      USING ERRCODE = 'P0132';
  END IF;

  IF _result = 'revoked' AND _revocation_date IS NULL THEN
    RAISE EXCEPTION 'A revoked outcome needs the revocation date'
      USING ERRCODE = 'P0133';
  END IF;

  SELECT * INTO _model FROM public.eld_device_models WHERE id = _model_id;
  IF _model.id IS NULL THEN
    RAISE EXCEPTION 'Unknown device model' USING ERRCODE = 'P0134';
  END IF;

  INSERT INTO public.eld_revoked_list_checks (
    eld_device_model_id, checked_by, result, fmcsa_list_date, notes,
    revocation_date, replacement_deadline
  ) VALUES (
    _model_id, _uid, _result, _fmcsa_list_date, _notes,
    CASE WHEN _result = 'revoked' THEN _revocation_date END,
    CASE WHEN _result = 'revoked'
         THEN COALESCE(_replacement_deadline, _revocation_date + 60) END
  )
  RETURNING id INTO _check_id;

  UPDATE public.eld_device_models m
     SET last_check_at = now(),
         last_check_result = _result,
         last_check_id = _check_id,
         fmcsa_list_date = _fmcsa_list_date,
         revocation_date = CASE WHEN _result = 'revoked' THEN _revocation_date END,
         replacement_deadline = CASE WHEN _result = 'revoked'
           THEN COALESCE(_replacement_deadline, _revocation_date + 60) END
   WHERE m.id = _model_id;

  -- Revoked only. Drivers are deliberately NOT notified here and no
  -- malfunction event is opened: a revocation is a fleet procurement
  -- decision, not a device fault. Wrongly telling a dozen drivers to start
  -- manual logs would be its own incident.
  IF _result = 'revoked' THEN
    -- Demo operators never count toward exposure.
    SELECT count(*) INTO _trucks
      FROM public.eld_devices d
      JOIN public.operators o ON o.id = d.operator_id
     WHERE d.eld_device_model_id = _model_id
       AND d.is_active
       AND COALESCE(o.is_demo, false) = false;

    FOR _staff IN
      SELECT DISTINCT user_id FROM public.user_roles
       WHERE role IN ('management', 'owner')
    LOOP
      INSERT INTO public.notifications (
        user_id, type, title, body, link, priority, entity_type, entity_id
      ) VALUES (
        _staff,
        'eld_device_model_revoked',
        'ELD model revoked — ' || _model.device_make || ' ' || _model.device_model,
        _model.provider_name || ' ' || _model.device_make || ' ' || _model.device_model
          || ' was moved to FMCSA''s revoked list on '
          || to_char(_revocation_date, 'Mon FMDD, YYYY') || '. '
          || _trucks || ' truck(s) run this model. Replacement deadline '
          || to_char(COALESCE(_replacement_deadline, _revocation_date + 60), 'Mon FMDD, YYYY') || '.',
        '/management?view=eld-device-models&model=' || _model_id::text,
        'action',
        'eld_device_model',
        _model_id
      );
    END LOOP;
  END IF;

  RETURN _check_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.record_revoked_list_check(uuid, text, date, text, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_revoked_list_check(uuid, text, date, text, date, date) TO authenticated;

-- Eighth artifact arm: revoked-list checks are fleet-level, so they carry no
-- operator or truck. A driver- or truck-scoped search would otherwise drop
-- them silently or attach them to the wrong driver — emit only on unscoped
-- searches.
CREATE OR REPLACE FUNCTION public.search_retention_archive(
  _operator_ids uuid[] DEFAULT NULL::uuid[],
  _from date DEFAULT NULL::date,
  _to date DEFAULT NULL::date,
  _truck text DEFAULT NULL::text,
  _event_id uuid DEFAULT NULL::uuid,
  _status text DEFAULT NULL::text,
  _include_demo boolean DEFAULT false
)
RETURNS TABLE(artifact_type text, artifact_id uuid, operator_id uuid, log_date date,
  occurred_at timestamp with time zone, status text, label text, truck_number text,
  supersedes_day_id uuid, event_id uuid, storage_bucket text, storage_path text, is_demo boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
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

  ORDER BY 5 DESC NULLS LAST;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.search_retention_archive(uuid[], date, date, text, uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_retention_archive(uuid[], date, date, text, uuid, text, boolean) TO authenticated;