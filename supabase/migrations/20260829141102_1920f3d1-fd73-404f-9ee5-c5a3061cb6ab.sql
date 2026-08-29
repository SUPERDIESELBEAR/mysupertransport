-- ============================================================
-- Module 6, Pass 1 — MultiService fuel import
-- ============================================================

CREATE TYPE public.fuel_provider AS ENUM ('multiservice');

CREATE TYPE public.fuel_match_status AS ENUM ('matched', 'unmatched', 'matched_with_disagreement');

CREATE TYPE public.fuel_line_type AS ENUM (
  'diesel', 'reefer', 'def', 'additive', 'minor_repairs', 'misc', 'tires',
  'cash_advance_12digit', 'cash_advance_emoney', 'cash_advance_insta',
  'fees', 'fuel_discount'
);

-- ------------------------------------------------------------
-- 1. Batches
-- ------------------------------------------------------------
CREATE TABLE public.fuel_import_batches (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider            public.fuel_provider NOT NULL DEFAULT 'multiservice',
  file_name           text NOT NULL,
  row_count           integer NOT NULL DEFAULT 0,
  imported_count      integer NOT NULL DEFAULT 0,
  duplicate_count     integer NOT NULL DEFAULT 0,
  matched_count       integer NOT NULL DEFAULT 0,
  unmatched_count     integer NOT NULL DEFAULT 0,
  disagreement_count  integer NOT NULL DEFAULT 0,
  flagged_count       integer NOT NULL DEFAULT 0,
  date_range_start    date,
  date_range_end      date,
  total_amount        numeric(12,2) NOT NULL DEFAULT 0,
  reconciliation_ok   boolean NOT NULL DEFAULT true,
  imported_by         uuid REFERENCES public.profiles(id),
  imported_at         timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fuel_import_batches TO authenticated;
GRANT ALL ON public.fuel_import_batches TO service_role;
ALTER TABLE public.fuel_import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fuel_batches_read_staff" ON public.fuel_import_batches
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "fuel_batches_write_management" ON public.fuel_import_batches
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE TRIGGER update_fuel_import_batches_updated_at
  BEFORE UPDATE ON public.fuel_import_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------
-- 2. Transactions (one per CSV row)
-- ------------------------------------------------------------
CREATE TABLE public.fuel_transactions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id                uuid NOT NULL REFERENCES public.fuel_import_batches(id) ON DELETE CASCADE,
  operator_id             uuid REFERENCES public.operators(id) ON DELETE SET NULL,
  matched_equipment_id    uuid REFERENCES public.equipment_items(id) ON DELETE SET NULL,

  -- as printed on the file
  card_no                 text NOT NULL,
  unit_no                 text,
  driver_name             text,
  city                    text,
  state                   text,
  invoice_no              text NOT NULL,
  invoice_date            date NOT NULL,
  daycode                 text,

  -- every category on the MultiService customized detail export
  diesel_amount                 numeric(12,2) NOT NULL DEFAULT 0,
  diesel_gallons                numeric(12,3) NOT NULL DEFAULT 0,
  reefer_amount                 numeric(12,2) NOT NULL DEFAULT 0,
  additive_amount               numeric(12,2) NOT NULL DEFAULT 0,
  minor_repairs_amount          numeric(12,2) NOT NULL DEFAULT 0,
  misc_amount                   numeric(12,2) NOT NULL DEFAULT 0,
  tires_amount                  numeric(12,2) NOT NULL DEFAULT 0,
  cash_advance_12digit_amount   numeric(12,2) NOT NULL DEFAULT 0,
  cash_advance_emoney_amount    numeric(12,2) NOT NULL DEFAULT 0,
  cash_advance_insta_amount     numeric(12,2) NOT NULL DEFAULT 0,
  def_amount                    numeric(12,2) NOT NULL DEFAULT 0,
  def_quantity                  numeric(12,3) NOT NULL DEFAULT 0,
  fees_amount                   numeric(12,2) NOT NULL DEFAULT 0,
  fuel_discount_amount          numeric(12,2) NOT NULL DEFAULT 0,
  total_amount                  numeric(12,2) NOT NULL DEFAULT 0,

  match_status            public.fuel_match_status NOT NULL DEFAULT 'unmatched',
  -- [{ field, csv_value, system_value }] — both values kept, never resolved here
  disagreement_fields     jsonb NOT NULL DEFAULT '[]'::jsonb,
  reconciliation_ok       boolean NOT NULL DEFAULT true,
  reconciliation_delta    numeric(12,2) NOT NULL DEFAULT 0,

  resolved_by             uuid REFERENCES public.profiles(id),
  resolved_at             timestamptz,
  resolution_note         text,

  created_by              uuid REFERENCES public.profiles(id),
  updated_by              uuid REFERENCES public.profiles(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  -- DEDUP KEY. Invoice No alone is the MERCHANT's number, not a MultiService
  -- sequence, so two truck stops will eventually both issue "59291".
  CONSTRAINT fuel_transactions_dedup_key UNIQUE (invoice_no, invoice_date, card_no)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fuel_transactions TO authenticated;
GRANT ALL ON public.fuel_transactions TO service_role;
ALTER TABLE public.fuel_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fuel_transactions_read_staff" ON public.fuel_transactions
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "fuel_transactions_write_management" ON public.fuel_transactions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE INDEX idx_fuel_transactions_batch ON public.fuel_transactions (batch_id);
CREATE INDEX idx_fuel_transactions_operator ON public.fuel_transactions (operator_id);
CREATE INDEX idx_fuel_transactions_invoice_date ON public.fuel_transactions (invoice_date);
CREATE INDEX idx_fuel_transactions_unmatched ON public.fuel_transactions (match_status)
  WHERE match_status <> 'matched';

CREATE TRIGGER update_fuel_transactions_updated_at
  BEFORE UPDATE ON public.fuel_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------
-- 3. Lines (one per non-zero category; 78 of 297 sample rows carry several)
-- ------------------------------------------------------------
CREATE TABLE public.fuel_transaction_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  uuid NOT NULL REFERENCES public.fuel_transactions(id) ON DELETE CASCADE,
  line_type       public.fuel_line_type NOT NULL,
  amount          numeric(12,2) NOT NULL,
  quantity        numeric(12,3),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fuel_transaction_lines_unique UNIQUE (transaction_id, line_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fuel_transaction_lines TO authenticated;
GRANT ALL ON public.fuel_transaction_lines TO service_role;
ALTER TABLE public.fuel_transaction_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fuel_lines_read_staff" ON public.fuel_transaction_lines
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "fuel_lines_write_management" ON public.fuel_transaction_lines
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE INDEX idx_fuel_transaction_lines_tx ON public.fuel_transaction_lines (transaction_id);

-- ------------------------------------------------------------
-- 4. Fuel discount pass-through lives on the pay policy
-- ------------------------------------------------------------
ALTER TABLE public.pay_policies
  ADD COLUMN IF NOT EXISTS fuel_discount_passthrough boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pay_policies.fuel_discount_passthrough IS
  'Whether the MultiService fuel discount is passed through to the driver. Off by default; '
  'applies forward only from the assignment effective date. Module 4 credits it as its own '
  'visible line item rather than netting it into the fuel deduction.';

-- ------------------------------------------------------------
-- 5. Name normalisation (token-sorted, punctuation-free) for disagreement checks
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fuel_normalize_name(_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'extensions'
AS $$
  SELECT COALESCE(
    (SELECT string_agg(tok, ' ' ORDER BY tok)
       FROM unnest(
         string_to_array(
           btrim(regexp_replace(upper(COALESCE(_name, '')), '[^A-Z0-9 ]', ' ', 'g')),
           ' '
         )
       ) AS tok
      WHERE tok <> ''),
    ''
  );
$$;

REVOKE ALL ON FUNCTION public.fuel_normalize_name(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fuel_normalize_name(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fuel_normalize_name(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fuel_normalize_name(text) TO service_role;

-- ------------------------------------------------------------
-- 6. Card resolution — the CARD is the authority.
--    Resolves through equipment_items + equipment_assignments, honouring the
--    assignment date range so a transaction dated before a handover resolves
--    to the PRIOR holder. Deliberately does NOT read
--    onboarding_status.fuel_card_number, which is a denormalised copy.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fuel_resolve_card(_card_no text, _on_date date)
RETURNS TABLE (operator_id uuid, equipment_id uuid, unit_number text, driver_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  SELECT o.id,
         ei.id,
         o.unit_number,
         btrim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, ''))
  FROM public.equipment_items ei
  JOIN public.equipment_assignments ea ON ea.equipment_id = ei.id
  JOIN public.operators o ON o.id = ea.operator_id
  LEFT JOIN public.profiles p ON p.user_id = o.user_id
  WHERE ei.device_type = 'fuel_card'
    AND upper(btrim(ei.serial_number)) = upper(btrim(COALESCE(_card_no, '')))
    AND ea.assigned_at::date <= _on_date
    AND (ea.returned_at IS NULL OR ea.returned_at::date >= _on_date)
  ORDER BY ea.assigned_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.fuel_resolve_card(text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fuel_resolve_card(text, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.fuel_resolve_card(text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fuel_resolve_card(text, date) TO service_role;

-- ------------------------------------------------------------
-- 7. Preview — resolution + duplicate detection, NO writes
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preview_fuel_import(_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  r jsonb;
  v_res record;
  v_status text;
  v_dis jsonb;
  v_key text;
  v_seen text[] := ARRAY[]::text[];
  v_out jsonb := '[]'::jsonb;
  v_dupes int := 0;
  v_matched int := 0;
  v_unmatched int := 0;
  v_disagree int := 0;
  v_flagged int := 0;
  v_total numeric(12,2) := 0;
  v_min date;
  v_max date;
  v_dup boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  FOR r IN SELECT elem FROM jsonb_array_elements(COALESCE(_rows, '[]'::jsonb)) AS elem LOOP
    v_key := COALESCE(r->>'invoice_no','') || '|' || COALESCE(r->>'invoice_date','') || '|' || COALESCE(r->>'card_no','');

    v_dup := (v_key = ANY (v_seen))
      OR EXISTS (
        SELECT 1 FROM public.fuel_transactions t
        WHERE t.invoice_no = (r->>'invoice_no')
          AND t.invoice_date = (r->>'invoice_date')::date
          AND t.card_no = (r->>'card_no')
      );
    v_seen := v_seen || v_key;

    SELECT * INTO v_res
    FROM public.fuel_resolve_card(r->>'card_no', (r->>'invoice_date')::date);

    v_dis := '[]'::jsonb;
    IF v_res.operator_id IS NULL THEN
      v_status := 'unmatched';
    ELSE
      IF COALESCE(NULLIF(btrim(r->>'unit_no'), ''), '') <> ''
         AND upper(btrim(r->>'unit_no')) IS DISTINCT FROM upper(btrim(COALESCE(v_res.unit_number, ''))) THEN
        v_dis := v_dis || jsonb_build_object(
          'field', 'unit_no',
          'csv_value', r->>'unit_no',
          'system_value', v_res.unit_number);
      END IF;
      IF COALESCE(NULLIF(btrim(r->>'driver_name'), ''), '') <> ''
         AND public.fuel_normalize_name(r->>'driver_name')
             IS DISTINCT FROM public.fuel_normalize_name(v_res.driver_name) THEN
        v_dis := v_dis || jsonb_build_object(
          'field', 'driver_name',
          'csv_value', r->>'driver_name',
          'system_value', v_res.driver_name);
      END IF;
      v_status := CASE WHEN jsonb_array_length(v_dis) > 0
                       THEN 'matched_with_disagreement' ELSE 'matched' END;
    END IF;

    IF NOT v_dup THEN
      IF v_status = 'matched' THEN v_matched := v_matched + 1;
      ELSIF v_status = 'unmatched' THEN v_unmatched := v_unmatched + 1;
      ELSE v_disagree := v_disagree + 1;
      END IF;
      IF COALESCE((r->>'reconciliation_ok')::boolean, true) = false THEN
        v_flagged := v_flagged + 1;
      END IF;
      v_total := v_total + COALESCE((r->>'total_amount')::numeric, 0);
      v_min := LEAST(v_min, (r->>'invoice_date')::date);
      v_max := GREATEST(v_max, (r->>'invoice_date')::date);
    ELSE
      v_dupes := v_dupes + 1;
    END IF;

    v_out := v_out || jsonb_build_object(
      'invoice_no',    r->>'invoice_no',
      'invoice_date',  r->>'invoice_date',
      'card_no',       r->>'card_no',
      'unit_no',       r->>'unit_no',
      'driver_name',   r->>'driver_name',
      'total_amount',  COALESCE((r->>'total_amount')::numeric, 0),
      'duplicate',     v_dup,
      'operator_id',   v_res.operator_id,
      'match_status',  v_status,
      'disagreement_fields', v_dis,
      'reconciliation_ok', COALESCE((r->>'reconciliation_ok')::boolean, true),
      'reconciliation_delta', COALESCE((r->>'reconciliation_delta')::numeric, 0)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'row_count',          jsonb_array_length(COALESCE(_rows, '[]'::jsonb)),
    'importable_count',   jsonb_array_length(COALESCE(_rows, '[]'::jsonb)) - v_dupes,
    'duplicate_count',    v_dupes,
    'matched_count',      v_matched,
    'unmatched_count',    v_unmatched,
    'disagreement_count', v_disagree,
    'flagged_count',      v_flagged,
    'total_amount',       v_total,
    'date_range_start',   v_min,
    'date_range_end',     v_max,
    'rows',               v_out
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_fuel_import(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preview_fuel_import(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.preview_fuel_import(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_fuel_import(jsonb) TO service_role;

-- ------------------------------------------------------------
-- 8. Commit — imports everything, including unmatched and flagged rows,
--    and skips duplicates.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.commit_fuel_import(
  _file_name text,
  _provider  text,
  _rows      jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_batch uuid;
  r jsonb;
  l jsonb;
  v_res record;
  v_status public.fuel_match_status;
  v_dis jsonb;
  v_tx uuid;
  v_inserted int := 0;
  v_dupes int := 0;
  v_matched int := 0;
  v_unmatched int := 0;
  v_disagree int := 0;
  v_flagged int := 0;
  v_total numeric(12,2) := 0;
  v_min date;
  v_max date;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.fuel_import_batches (provider, file_name, imported_by, row_count)
  VALUES (COALESCE(NULLIF(_provider, ''), 'multiservice')::public.fuel_provider,
          _file_name, v_actor, jsonb_array_length(COALESCE(_rows, '[]'::jsonb)))
  RETURNING id INTO v_batch;

  FOR r IN SELECT elem FROM jsonb_array_elements(COALESCE(_rows, '[]'::jsonb)) AS elem LOOP
    IF EXISTS (
      SELECT 1 FROM public.fuel_transactions t
      WHERE t.invoice_no = (r->>'invoice_no')
        AND t.invoice_date = (r->>'invoice_date')::date
        AND t.card_no = (r->>'card_no')
    ) THEN
      v_dupes := v_dupes + 1;
      CONTINUE;
    END IF;

    SELECT * INTO v_res
    FROM public.fuel_resolve_card(r->>'card_no', (r->>'invoice_date')::date);

    v_dis := '[]'::jsonb;
    IF v_res.operator_id IS NULL THEN
      v_status := 'unmatched';
    ELSE
      IF COALESCE(NULLIF(btrim(r->>'unit_no'), ''), '') <> ''
         AND upper(btrim(r->>'unit_no')) IS DISTINCT FROM upper(btrim(COALESCE(v_res.unit_number, ''))) THEN
        v_dis := v_dis || jsonb_build_object(
          'field', 'unit_no', 'csv_value', r->>'unit_no', 'system_value', v_res.unit_number);
      END IF;
      IF COALESCE(NULLIF(btrim(r->>'driver_name'), ''), '') <> ''
         AND public.fuel_normalize_name(r->>'driver_name')
             IS DISTINCT FROM public.fuel_normalize_name(v_res.driver_name) THEN
        v_dis := v_dis || jsonb_build_object(
          'field', 'driver_name', 'csv_value', r->>'driver_name', 'system_value', v_res.driver_name);
      END IF;
      v_status := (CASE WHEN jsonb_array_length(v_dis) > 0
                        THEN 'matched_with_disagreement' ELSE 'matched' END)::public.fuel_match_status;
    END IF;

    INSERT INTO public.fuel_transactions (
      batch_id, operator_id, matched_equipment_id,
      card_no, unit_no, driver_name, city, state, invoice_no, invoice_date, daycode,
      diesel_amount, diesel_gallons, reefer_amount, additive_amount, minor_repairs_amount,
      misc_amount, tires_amount, cash_advance_12digit_amount, cash_advance_emoney_amount,
      cash_advance_insta_amount, def_amount, def_quantity, fees_amount, fuel_discount_amount,
      total_amount, match_status, disagreement_fields, reconciliation_ok, reconciliation_delta,
      created_by, updated_by
    ) VALUES (
      v_batch, v_res.operator_id, v_res.equipment_id,
      r->>'card_no', r->>'unit_no', r->>'driver_name', r->>'city', r->>'state',
      r->>'invoice_no', (r->>'invoice_date')::date, r->>'daycode',
      COALESCE((r->>'diesel_amount')::numeric, 0),
      COALESCE((r->>'diesel_gallons')::numeric, 0),
      COALESCE((r->>'reefer_amount')::numeric, 0),
      COALESCE((r->>'additive_amount')::numeric, 0),
      COALESCE((r->>'minor_repairs_amount')::numeric, 0),
      COALESCE((r->>'misc_amount')::numeric, 0),
      COALESCE((r->>'tires_amount')::numeric, 0),
      COALESCE((r->>'cash_advance_12digit_amount')::numeric, 0),
      COALESCE((r->>'cash_advance_emoney_amount')::numeric, 0),
      COALESCE((r->>'cash_advance_insta_amount')::numeric, 0),
      COALESCE((r->>'def_amount')::numeric, 0),
      COALESCE((r->>'def_quantity')::numeric, 0),
      COALESCE((r->>'fees_amount')::numeric, 0),
      COALESCE((r->>'fuel_discount_amount')::numeric, 0),
      COALESCE((r->>'total_amount')::numeric, 0),
      v_status, v_dis,
      COALESCE((r->>'reconciliation_ok')::boolean, true),
      COALESCE((r->>'reconciliation_delta')::numeric, 0),
      v_actor, v_actor
    )
    RETURNING id INTO v_tx;

    FOR l IN SELECT elem FROM jsonb_array_elements(COALESCE(r->'lines', '[]'::jsonb)) AS elem LOOP
      INSERT INTO public.fuel_transaction_lines (transaction_id, line_type, amount, quantity)
      VALUES (v_tx, (l->>'line_type')::public.fuel_line_type,
              COALESCE((l->>'amount')::numeric, 0),
              NULLIF(l->>'quantity', '')::numeric)
      ON CONFLICT (transaction_id, line_type) DO NOTHING;
    END LOOP;

    v_inserted := v_inserted + 1;
    IF v_status = 'matched' THEN v_matched := v_matched + 1;
    ELSIF v_status = 'unmatched' THEN v_unmatched := v_unmatched + 1;
    ELSE v_disagree := v_disagree + 1;
    END IF;
    IF COALESCE((r->>'reconciliation_ok')::boolean, true) = false THEN
      v_flagged := v_flagged + 1;
    END IF;
    v_total := v_total + COALESCE((r->>'total_amount')::numeric, 0);
    v_min := LEAST(v_min, (r->>'invoice_date')::date);
    v_max := GREATEST(v_max, (r->>'invoice_date')::date);
  END LOOP;

  UPDATE public.fuel_import_batches SET
    imported_count = v_inserted,
    duplicate_count = v_dupes,
    matched_count = v_matched,
    unmatched_count = v_unmatched,
    disagreement_count = v_disagree,
    flagged_count = v_flagged,
    total_amount = v_total,
    date_range_start = v_min,
    date_range_end = v_max,
    reconciliation_ok = (v_flagged = 0)
  WHERE id = v_batch;

  RETURN jsonb_build_object(
    'batch_id', v_batch,
    'row_count', jsonb_array_length(COALESCE(_rows, '[]'::jsonb)),
    'imported_count', v_inserted,
    'duplicate_count', v_dupes,
    'matched_count', v_matched,
    'unmatched_count', v_unmatched,
    'disagreement_count', v_disagree,
    'flagged_count', v_flagged,
    'total_amount', v_total,
    'date_range_start', v_min,
    'date_range_end', v_max
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commit_fuel_import(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commit_fuel_import(text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.commit_fuel_import(text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commit_fuel_import(text, text, jsonb) TO service_role;

-- ------------------------------------------------------------
-- 9. Review queue — the single writer for the unmatched -> matched transition
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_fuel_transaction_operator(
  _transaction_id uuid,
  _operator_id    uuid,
  _note           text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_row public.fuel_transactions;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _operator_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.operators o WHERE o.id = _operator_id) THEN
    RAISE EXCEPTION 'Unknown operator';
  END IF;

  UPDATE public.fuel_transactions t SET
    operator_id     = _operator_id,
    match_status    = 'matched',
    resolved_by     = v_actor,
    resolved_at     = now(),
    resolution_note = _note,
    updated_by      = v_actor
  WHERE t.id = _transaction_id
  RETURNING t.* INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Fuel transaction not found';
  END IF;

  RETURN jsonb_build_object('id', v_row.id, 'operator_id', v_row.operator_id,
                            'match_status', v_row.match_status);
END;
$$;

REVOKE ALL ON FUNCTION public.assign_fuel_transaction_operator(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_fuel_transaction_operator(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.assign_fuel_transaction_operator(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_fuel_transaction_operator(uuid, uuid, text) TO service_role;