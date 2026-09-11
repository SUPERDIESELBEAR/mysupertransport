-- Quarterly DOT Inspection & Clean Inspection Bonus program.
-- Additive only: new enums, new tables, new columns on roadside_stops, new functions.

-- ---------------------------------------------------------------- enums
DO $$ BEGIN
  CREATE TYPE public.inspection_cycle_status AS ENUM
    ('upcoming', 'due', 'submitted', 'closed', 'overdue', 'grace');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.inspection_payment_kind AS ENUM
    ('inspection_reimbursement', 'roadside_bonus');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.inspection_payment_status AS ENUM
    ('pending', 'approved', 'rejected', 'settled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------- program settings (configurable)
CREATE TABLE IF NOT EXISTS public.inspection_program_settings (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reimbursement_cap        numeric NOT NULL DEFAULT 150,
  bonus_level_1            numeric NOT NULL DEFAULT 100,
  bonus_level_2            numeric NOT NULL DEFAULT 50,
  bonus_level_3            numeric NOT NULL DEFAULT 25,
  bonus_report_window_hours integer NOT NULL DEFAULT 24,
  max_grace_days           integer NOT NULL DEFAULT 15,
  max_grace_per_12_months  integer NOT NULL DEFAULT 2,
  group_a_months           integer[] NOT NULL DEFAULT ARRAY[10, 1, 4, 7],
  group_b_months           integer[] NOT NULL DEFAULT ARRAY[12, 3, 6, 9],
  reminder_offsets_days    integer[] NOT NULL DEFAULT ARRAY[30, 14, 3],
  submission_email         text NOT NULL DEFAULT 'inspections@mysupertransport.com',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  updated_by               uuid
);

GRANT SELECT ON public.inspection_program_settings TO authenticated;
GRANT INSERT, UPDATE ON public.inspection_program_settings TO authenticated;
GRANT ALL ON public.inspection_program_settings TO service_role;
ALTER TABLE public.inspection_program_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read program settings" ON public.inspection_program_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "management writes program settings" ON public.inspection_program_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

INSERT INTO public.inspection_program_settings (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM public.inspection_program_settings);

-- -------------------------------------------------------------- cycles
CREATE TABLE IF NOT EXISTS public.inspection_cycles (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id              uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  unit_number              text,
  assigned_group           text NOT NULL CHECK (assigned_group IN ('A', 'B')),
  cycle_year               integer NOT NULL,
  cycle_month              integer NOT NULL CHECK (cycle_month BETWEEN 1 AND 12),
  status                   public.inspection_cycle_status NOT NULL DEFAULT 'upcoming',
  inspection_id            uuid REFERENCES public.truck_dot_inspections(id) ON DELETE SET NULL,
  report_file_path         text,
  report_file_name         text,
  invoice_file_path        text,
  invoice_file_name        text,
  inspection_date          date,
  facility                 text,
  inspection_fee           numeric,
  billed_to_company_account boolean NOT NULL DEFAULT false,
  credited_reason          text,
  defects_identified       boolean NOT NULL DEFAULT false,
  defects_repaired         boolean NOT NULL DEFAULT false,
  defect_notes             text,
  grace_until              date,
  grace_granted_at         timestamptz,
  grace_requested_by       uuid,
  grace_reason             text,
  grace_is_override        boolean NOT NULL DEFAULT false,
  grace_override_by        uuid,
  submitted_at             timestamptz,
  closed_at                timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid,
  updated_by               uuid,
  UNIQUE (operator_id, cycle_year, cycle_month)
);

CREATE INDEX IF NOT EXISTS inspection_cycles_operator_idx
  ON public.inspection_cycles (operator_id, cycle_year DESC, cycle_month DESC);
CREATE INDEX IF NOT EXISTS inspection_cycles_status_idx
  ON public.inspection_cycles (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspection_cycles TO authenticated;
GRANT ALL ON public.inspection_cycles TO service_role;
ALTER TABLE public.inspection_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff manage inspection cycles" ON public.inspection_cycles
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "operators read own inspection cycles" ON public.inspection_cycles
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.operators o
    WHERE o.id = inspection_cycles.operator_id AND o.user_id = auth.uid()
  ));

-- ------------------------------------------------------------ payments
CREATE TABLE IF NOT EXISTS public.inspection_program_payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             public.inspection_payment_kind NOT NULL,
  cycle_id         uuid REFERENCES public.inspection_cycles(id) ON DELETE CASCADE,
  roadside_stop_id uuid REFERENCES public.roadside_stops(id) ON DELETE CASCADE,
  operator_id      uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  amount           numeric NOT NULL CHECK (amount >= 0),
  description      text,
  status           public.inspection_payment_status NOT NULL DEFAULT 'pending',
  review_note      text,
  reviewed_by      uuid,
  reviewed_at      timestamptz,
  settlement_id    uuid,
  settled_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid,
  updated_by       uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS inspection_payments_one_per_cycle
  ON public.inspection_program_payments (cycle_id) WHERE cycle_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS inspection_payments_one_per_stop
  ON public.inspection_program_payments (roadside_stop_id) WHERE roadside_stop_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS inspection_payments_status_idx
  ON public.inspection_program_payments (status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspection_program_payments TO authenticated;
GRANT ALL ON public.inspection_program_payments TO service_role;
ALTER TABLE public.inspection_program_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff manage inspection payments" ON public.inspection_program_payments
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "operators read own inspection payments" ON public.inspection_program_payments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.operators o
    WHERE o.id = inspection_program_payments.operator_id AND o.user_id = auth.uid()
  ));

-- -------------------------------------------- roadside bonus columns (additive)
ALTER TABLE public.roadside_stops
  ADD COLUMN IF NOT EXISTS bonus_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bonus_amount numeric,
  ADD COLUMN IF NOT EXISTS report_submitted_at timestamptz;

-- ------------------------------------------------------- grace grant RPC
CREATE OR REPLACE FUNCTION public.grant_inspection_grace(
  _cycle_id uuid,
  _days integer,
  _reason text,
  _override boolean DEFAULT false
)
RETURNS public.inspection_cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
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

  SELECT * INTO v_settings FROM public.inspection_program_settings ORDER BY created_at LIMIT 1;

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

  INSERT INTO public.audit_log (action, entity_type, entity_id, actor_id, details)
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
$$;

COMMENT ON FUNCTION public.grant_inspection_grace(uuid, integer, text, boolean) IS
  'Grants a §9 grace extension on a quarterly inspection cycle. The allowance is read INSIDE the function from inspection_program_settings.max_grace_per_12_months, never passed in by the caller. Past the allowance the grant is refused unless management supplies an override with a written reason. Every grant is audit-logged.';

REVOKE EXECUTE ON FUNCTION public.grant_inspection_grace(uuid, integer, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_inspection_grace(uuid, integer, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_inspection_grace(uuid, integer, text, boolean) TO service_role;

-- --------------------------------------------------- grace usage counter (read)
CREATE OR REPLACE FUNCTION public.inspection_grace_used(_operator_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT count(*)::integer
  FROM public.inspection_cycles c
  WHERE c.operator_id = _operator_id
    AND c.grace_granted_at IS NOT NULL
    AND c.grace_granted_at >= now() - interval '12 months'
    AND (
      public.is_staff(auth.uid())
      OR EXISTS (SELECT 1 FROM public.operators o WHERE o.id = _operator_id AND o.user_id = auth.uid())
    );
$$;

COMMENT ON FUNCTION public.inspection_grace_used(uuid) IS
  'Grace extensions granted to an operator in the trailing 12 months. Self-or-staff gated in-body.';

REVOKE EXECUTE ON FUNCTION public.inspection_grace_used(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inspection_grace_used(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inspection_grace_used(uuid) TO service_role;

-- --------------------------------------------------------- updated_at triggers
CREATE OR REPLACE FUNCTION public.touch_inspection_program_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.touch_inspection_program_row() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS touch_inspection_cycles ON public.inspection_cycles;
CREATE TRIGGER touch_inspection_cycles
  BEFORE UPDATE ON public.inspection_cycles
  FOR EACH ROW EXECUTE FUNCTION public.touch_inspection_program_row();

DROP TRIGGER IF EXISTS touch_inspection_payments ON public.inspection_program_payments;
CREATE TRIGGER touch_inspection_payments
  BEFORE UPDATE ON public.inspection_program_payments
  FOR EACH ROW EXECUTE FUNCTION public.touch_inspection_program_row();