-- Demo carrier stage 4 part 2a: PEI cadence and the inspection programme per carrier;
-- no SUPERTRANSPORT values in column defaults.

-- FIX 1: PEI cadence keyed by carrier. The boolean singleton key is retired.
ALTER TABLE public.pei_cadence_settings DROP CONSTRAINT pei_cadence_settings_pkey;
ALTER TABLE public.pei_cadence_settings DROP CONSTRAINT pei_cadence_settings_id_check;
ALTER TABLE public.pei_cadence_settings ADD CONSTRAINT pei_cadence_settings_pkey PRIMARY KEY (company_id);
COMMENT ON COLUMN public.pei_cadence_settings.id IS 'DEPRECATED: former singleton key (always true); the table is keyed by company_id since stage 4 part 2a.';

CREATE OR REPLACE FUNCTION public.set_pei_cadence_settings(p_enabled boolean, p_interval_days integer, p_gfe_after_days integer, p_note text)
 RETURNS pei_cadence_settings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_company uuid := public.current_company_id();
  v_row public.pei_cadence_settings;
BEGIN
  IF v_actor IS NULL
     OR NOT (public.has_role(v_actor, 'owner') OR public.has_role(v_actor, 'management')) THEN
    RAISE EXCEPTION 'Not authorized to change PEI follow-up settings';
  END IF;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'No carrier resolves for this user; PEI follow-up settings cannot be changed.' USING ERRCODE = '42501';
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
   WHERE company_id = v_company
  RETURNING * INTO v_row;
  IF v_row.company_id IS NULL THEN
    RAISE EXCEPTION 'This carrier has no PEI follow-up settings row.' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_label, metadata)
  VALUES (
    v_actor, public._audit_actor_name(v_actor), 'pei_cadence_settings_updated',
    'pei_cadence_settings', 'PEI follow-up settings',
    jsonb_build_object('enabled', p_enabled, 'interval_days', p_interval_days,
      'gfe_after_days', p_gfe_after_days, 'note', btrim(p_note), 'company_id', v_company)
  );
  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.set_pei_cadence_settings(boolean,integer,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_pei_cadence_settings(boolean,integer,integer,text) TO authenticated, service_role;

-- FIX 2: the inspection programme can be off, per carrier.
ALTER TABLE public.inspection_program_settings ADD COLUMN programme_enabled boolean NOT NULL DEFAULT true;
CREATE UNIQUE INDEX inspection_program_settings_company_uniq ON public.inspection_program_settings (company_id);
ALTER TABLE public.inspection_program_settings ALTER COLUMN submission_email DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.request_inspection_grace(_days integer, _reason text)
 RETURNS inspection_cycles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_operator  public.operators;
  v_unit      text;
  v_digits    text;
  v_group     text;
  v_months    integer[];
  v_cycle     public.inspection_cycles;
  v_year      integer;
  v_month     integer;
  i           integer;
  v_settings  public.inspection_program_settings;
BEGIN
  SELECT * INTO v_operator FROM public.operators
   WHERE user_id = auth.uid() AND is_active
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only an active operator may request an inspection extension.' USING ERRCODE = '42501';
  END IF;

  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required so staff can review the request.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_settings FROM public.inspection_program_settings WHERE company_id = public.current_company_id();
  -- PER CARRIER (stage 4 part 2a): the caller's own programme; none, or off, refuses.
  IF v_settings.id IS NULL OR NOT v_settings.programme_enabled THEN
    RAISE EXCEPTION 'The inspection programme is off for this carrier, so no extension can be requested or granted.'
      USING ERRCODE = '42501';
  END IF;
  IF _days IS NULL OR _days < 1 OR _days > COALESCE(v_settings.max_grace_days, 15) THEN
    RAISE EXCEPTION 'An extension must be between 1 and % days.', COALESCE(v_settings.max_grace_days, 15)
      USING ERRCODE = '22023';
  END IF;

  -- Resolve the unit through the one resolver (onboarding first, operators fallback).
  SELECT public.operator_unit_number(os.unit_number, v_operator.unit_number)
    INTO v_unit
  FROM public.onboarding_status os
  WHERE os.operator_id = v_operator.id
  LIMIT 1;
  IF v_unit IS NULL THEN
    v_unit := v_operator.unit_number;
  END IF;

  v_digits := regexp_replace(COALESCE(v_unit, ''), '\D', '', 'g');
  IF v_digits = '' THEN
    RAISE EXCEPTION 'No unit number is on file, so no inspection cycle can be determined. Please contact staff.'
      USING ERRCODE = '22023';
  END IF;
  v_group := CASE WHEN (substr(v_digits, length(v_digits), 1))::integer % 2 = 1 THEN 'A' ELSE 'B' END;
  v_months := CASE WHEN v_group = 'A'
    THEN COALESCE(v_settings.group_a_months, ARRAY[10,1,4,7])
    ELSE COALESCE(v_settings.group_b_months, ARRAY[12,3,6,9]) END;

  -- Current open cycle, or the next assigned month from today.
  SELECT * INTO v_cycle FROM public.inspection_cycles
   WHERE operator_id = v_operator.id AND closed_at IS NULL
   ORDER BY cycle_year DESC, cycle_month DESC
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    v_year := extract(year FROM now())::integer;
    v_month := extract(month FROM now())::integer;
    FOR i IN 0..23 LOOP
      EXIT WHEN v_month = ANY (v_months);
      v_month := v_month + 1;
      IF v_month > 12 THEN v_month := 1; v_year := v_year + 1; END IF;
    END LOOP;
    INSERT INTO public.inspection_cycles (
      operator_id, unit_number, assigned_group, cycle_year, cycle_month, status, created_by, updated_by
    ) VALUES (
      v_operator.id, v_unit, v_group, v_year, v_month,
      CASE WHEN make_date(v_year, v_month, 1) <= current_date THEN 'due'::public.inspection_cycle_status
           ELSE 'upcoming'::public.inspection_cycle_status END,
      auth.uid(), auth.uid()
    )
    ON CONFLICT (operator_id, cycle_year, cycle_month) DO NOTHING
    RETURNING * INTO v_cycle;
    IF NOT FOUND THEN
      SELECT * INTO v_cycle FROM public.inspection_cycles
       WHERE operator_id = v_operator.id AND cycle_year = v_year AND cycle_month = v_month
       FOR UPDATE;
    END IF;
  END IF;

  IF v_cycle.status IN ('submitted', 'closed') THEN
    RAISE EXCEPTION 'This inspection cycle is already submitted.' USING ERRCODE = '42501';
  END IF;
  IF v_cycle.grace_until IS NOT NULL THEN
    RAISE EXCEPTION 'An extension is already active on this cycle.' USING ERRCODE = '42501';
  END IF;
  IF v_cycle.grace_request_status = 'pending' THEN
    RAISE EXCEPTION 'A request is already waiting for staff review on this cycle.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.inspection_cycles
     SET grace_request_status = 'pending',
         grace_request_days = _days,
         grace_request_reason = btrim(_reason),
         grace_requested_at = now(),
         grace_reviewed_by = NULL,
         grace_reviewed_at = NULL,
         grace_decline_reason = NULL,
         updated_at = now(),
         updated_by = auth.uid()
   WHERE id = v_cycle.id
   RETURNING * INTO v_cycle;

  INSERT INTO public.audit_log (action, entity_type, entity_id, actor_id, metadata)
  VALUES (
    'inspection_grace_requested',
    'inspection_cycles',
    v_cycle.id,
    auth.uid(),
    jsonb_build_object('days', _days, 'reason', btrim(_reason),
                       'cycle', v_cycle.cycle_year || '-' || lpad(v_cycle.cycle_month::text, 2, '0'))
  );

  RETURN v_cycle;
END;
$function$;

CREATE OR REPLACE FUNCTION public.grant_inspection_grace(_cycle_id uuid, _days integer, _reason text, _override boolean DEFAULT false)
 RETURNS inspection_cycles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_cycle    public.inspection_cycles;
  v_settings public.inspection_program_settings;
  v_used     integer;
  v_is_mgmt  boolean;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only staff may grant an inspection grace period.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_cycle FROM public.inspection_cycles WHERE id = _cycle_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inspection cycle not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_settings FROM public.inspection_program_settings WHERE company_id = public.current_company_id();
  -- PER CARRIER (stage 4 part 2a): the caller's own programme; none, or off, refuses.
  IF v_settings.id IS NULL OR NOT v_settings.programme_enabled THEN
    RAISE EXCEPTION 'The inspection programme is off for this carrier, so no extension can be requested or granted.'
      USING ERRCODE = '42501';
  END IF;

  IF _days IS NULL OR _days < 1 OR _days > COALESCE(v_settings.max_grace_days, 15) THEN
    RAISE EXCEPTION 'Grace period must be between 1 and % days.', COALESCE(v_settings.max_grace_days, 15)
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_used
  FROM public.inspection_cycles c
  WHERE c.operator_id = v_cycle.operator_id
    AND c.id <> v_cycle.id
    AND c.grace_granted_at IS NOT NULL
    AND c.grace_granted_at >= now() - interval '12 months';

  v_is_mgmt := public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner');

  IF v_used >= COALESCE(v_settings.max_grace_per_12_months, 2) THEN
    IF NOT _override THEN
      RAISE EXCEPTION 'This driver has already used % grace extensions in the last 12 months. A management override with a written reason is required.', v_used
        USING ERRCODE = '42501';
    END IF;
    IF NOT v_is_mgmt THEN
      RAISE EXCEPTION 'Only management may override the grace allowance.' USING ERRCODE = '42501';
    END IF;
    IF _reason IS NULL OR btrim(_reason) = '' THEN
      RAISE EXCEPTION 'A written reason is required for a grace override.' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.inspection_cycles
     SET grace_until = (make_date(cycle_year, cycle_month, 1) + interval '1 month')::date + (_days - 1),
         grace_granted_at = now(),
         grace_requested_by = auth.uid(),
         grace_reason = NULLIF(btrim(COALESCE(_reason, '')), ''),
         grace_is_override = (v_used >= COALESCE(v_settings.max_grace_per_12_months, 2)),
         grace_override_by = CASE WHEN v_used >= COALESCE(v_settings.max_grace_per_12_months, 2) THEN auth.uid() ELSE NULL END,
         status = 'grace',
         updated_at = now(),
         updated_by = auth.uid()
   WHERE id = _cycle_id
   RETURNING * INTO v_cycle;

  INSERT INTO public.audit_log (action, entity_type, entity_id, actor_id, metadata)
  VALUES (
    'inspection_grace_granted',
    'inspection_cycles',
    _cycle_id,
    auth.uid(),
    jsonb_build_object(
      'days', _days,
      'reason', _reason,
      'override', v_cycle.grace_is_override,
      'prior_grants_12mo', v_used
    )
  );

  RETURN v_cycle;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_inspection_programme_enabled()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.inspection_program_settings s
     WHERE s.company_id = NEW.company_id AND s.programme_enabled
  ) THEN
    RAISE EXCEPTION 'The inspection programme is off for this carrier; no reimbursement or bonus can be recorded.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.enforce_inspection_programme_enabled() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER ab_enforce_inspection_programme_enabled
  BEFORE INSERT ON public.inspection_program_payments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_inspection_programme_enabled();

-- FIX 3: no SUPERTRANSPORT values in column defaults (every carrier row supplies them).
ALTER TABLE public.invoice_number_config ALTER COLUMN prefix DROP DEFAULT;
ALTER TABLE public.load_number_config ALTER COLUMN prefix DROP DEFAULT;
ALTER TABLE public.carrier_profile ALTER COLUMN fmcsa_division_state DROP DEFAULT;
CREATE UNIQUE INDEX fleet_settings_company_uniq ON public.fleet_settings (company_id);

CREATE OR REPLACE FUNCTION public.allocate_invoice_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_company uuid := public.current_company_id();
  v_year    int  := EXTRACT(YEAR FROM (now() AT TIME ZONE 'America/Chicago'))::int;
  v_cfg     public.invoice_number_config%ROWTYPE;
  v_seq     int;
BEGIN
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'No carrier company is configured; an invoice number cannot be allocated.'
      USING ERRCODE = '22000';
  END IF;

  SELECT * INTO v_cfg
    FROM public.invoice_number_config
   WHERE company_id = v_company AND year = v_year
   FOR UPDATE;

  IF NOT FOUND THEN
    -- A new year's row carries the carrier's OWN numbering forward; no default prefix
    -- exists any more (stage 4 part 2a). A carrier with no row at all is refused.
    INSERT INTO public.invoice_number_config (company_id, year, prefix, separator, sequence_padding)
    SELECT v_company, v_year, p.prefix, p.separator, p.sequence_padding
      FROM public.invoice_number_config p
     WHERE p.company_id = v_company
     ORDER BY p.year DESC
     LIMIT 1
    RETURNING * INTO v_cfg;
    IF v_cfg.id IS NULL THEN
      RAISE EXCEPTION 'This carrier has no invoice numbering configured; an invoice number cannot be allocated.'
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  v_seq := v_cfg.next_sequence;

  IF v_seq > (10 ^ v_cfg.sequence_padding)::int - 1 THEN
    RAISE EXCEPTION 'Invoice sequence for % is exhausted at % digits (max %). Widen sequence_padding before invoicing again.',
      v_year, v_cfg.sequence_padding, (10 ^ v_cfg.sequence_padding)::int - 1
      USING ERRCODE = '22003';
  END IF;

  UPDATE public.invoice_number_config
     SET next_sequence = v_seq + 1, updated_at = now()
   WHERE id = v_cfg.id;

  RETURN v_cfg.prefix
       || to_char(make_date(v_year, 1, 1), 'YY')
       || v_cfg.separator
       || lpad(v_seq::text, v_cfg.sequence_padding, '0');
END;
$function$;