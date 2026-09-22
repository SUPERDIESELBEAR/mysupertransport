-- PER-DRIVER PAY, PASS 2 OF 5 — version the company pay policy for real.
--
-- Pass 1 (migration 0037) made every reader resolve the version in force on a
-- given date. This pass lets a second version EXIST: one CURRENT company
-- default per company, any number of CLOSED ones, and a rate that is never
-- edited in place.

-- ---------------------------------------------------------------------------
-- STEP 1 — re-scope the single-company-default index to CURRENT versions only.
--
-- Was: UNIQUE (company_id, is_company_default) WHERE is_company_default
--      -> exactly ONE default row per company, ever, so a history was impossible.
-- Now: the same, additionally WHERE effective_to IS NULL
--      -> one CURRENT default per company; closed versions are unlimited history.
--
-- UNDO (restores the pre-0038 rule; only possible while at most one default
-- version per company exists in total):
--   DROP INDEX public.pay_policies_single_company_default;
--   CREATE UNIQUE INDEX pay_policies_single_company_default
--     ON public.pay_policies (company_id, is_company_default)
--     WHERE is_company_default;
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.pay_policies_single_company_default;

CREATE UNIQUE INDEX pay_policies_single_company_default
  ON public.pay_policies (company_id, is_company_default)
  WHERE is_company_default AND effective_to IS NULL;

COMMENT ON COLUMN public.pay_policies.effective_to IS
  'NULL = the current version. A date = the last day this version governed; the row is then closed history and append-only. Set only via open_pay_policy_version() or by an owner closing the current version.';

-- ---------------------------------------------------------------------------
-- STEP 2 — the append-only guard.
--
-- A rate is never edited in place: a new rate is a NEW VERSION. Past work weeks
-- must keep calculating with the rate that was in force for them (P41), and a
-- settlement that has already paid must stay reproducible.
--
-- FROZEN on an existing row (a change is a new version, never an edit):
--   the ten percentage columns, the charge_pay_classes pay-treatment map (it
--   decides revenue vs reimbursement, so it moves money exactly as a percentage
--   does), effective_from, effective_date, company_id, is_company_default,
--   created_at, created_by.
-- The ONE date change allowed: setting effective_to on the CURRENT version
--   (NULL -> a date), with pay_policy.change. Re-opening a closed version, or
--   moving an already-set effective_to, is refused.
-- IN PLACE, by design: fuel_discount_passthrough (P40 — the Settlement Settings
--   toggle is a setting, not a rate, and must keep working), name, description,
--   is_active. RLS already requires pay_policy.change for any UPDATE; the guard
--   states it again for the date change so a non-owner gets a LOUD refusal
--   instead of a silent zero-row update.
-- DELETE: refused for everyone, owner included. A version is history.
--
-- Unlike the 0027/0029 guards there is no `auth.uid() IS NULL` pass-through for
-- service-role callers: no edge function writes this table, so a privileged
-- caller editing a rate in place is a defect too. A future migration that must
-- correct a row does so with `ALTER TABLE public.pay_policies DISABLE TRIGGER
-- ab_guard_pay_policy_append_only;` in the same transaction, which is a
-- deliberate, reviewable act.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_pay_policy_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_frozen text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'A pay policy version is never deleted. Close it by opening a new version instead; past settlements are calculated with the rate that was in force for their week.'
      USING ERRCODE = '42501';
  END IF;

  -- Which frozen column moved, if any. Named one at a time so the refusal says
  -- WHICH rate someone tried to edit.
  v_frozen := CASE
    WHEN NEW.linehaul_pct            IS DISTINCT FROM OLD.linehaul_pct            THEN 'linehaul_pct'
    WHEN NEW.fsc_pct                 IS DISTINCT FROM OLD.fsc_pct                 THEN 'fsc_pct'
    WHEN NEW.detention_pct           IS DISTINCT FROM OLD.detention_pct           THEN 'detention_pct'
    WHEN NEW.layover_pct             IS DISTINCT FROM OLD.layover_pct             THEN 'layover_pct'
    WHEN NEW.tonu_pct                IS DISTINCT FROM OLD.tonu_pct                THEN 'tonu_pct'
    WHEN NEW.stopoff_pct             IS DISTINCT FROM OLD.stopoff_pct             THEN 'stopoff_pct'
    WHEN NEW.lumper_reimbursement_pct IS DISTINCT FROM OLD.lumper_reimbursement_pct THEN 'lumper_reimbursement_pct'
    WHEN NEW.per_ton_pct             IS DISTINCT FROM OLD.per_ton_pct             THEN 'per_ton_pct'
    WHEN NEW.loadout_pct             IS DISTINCT FROM OLD.loadout_pct             THEN 'loadout_pct'
    WHEN NEW.other_accessorial_pct   IS DISTINCT FROM OLD.other_accessorial_pct   THEN 'other_accessorial_pct'
    WHEN NEW.charge_pay_classes      IS DISTINCT FROM OLD.charge_pay_classes      THEN 'charge_pay_classes'
    WHEN NEW.effective_from          IS DISTINCT FROM OLD.effective_from          THEN 'effective_from'
    WHEN NEW.effective_date          IS DISTINCT FROM OLD.effective_date          THEN 'effective_date'
    WHEN NEW.company_id              IS DISTINCT FROM OLD.company_id              THEN 'company_id'
    WHEN NEW.is_company_default      IS DISTINCT FROM OLD.is_company_default      THEN 'is_company_default'
    WHEN NEW.created_at              IS DISTINCT FROM OLD.created_at              THEN 'created_at'
    WHEN NEW.created_by              IS DISTINCT FROM OLD.created_by              THEN 'created_by'
    ELSE NULL
  END;

  IF v_frozen IS NOT NULL THEN
    RAISE EXCEPTION
      'A pay policy version is append-only: % cannot change on an existing version (%). A new rate is a NEW version, effective from a date.',
      v_frozen, OLD.id
      USING ERRCODE = '42501';
  END IF;

  IF NEW.effective_to IS DISTINCT FROM OLD.effective_to THEN
    IF OLD.effective_to IS NOT NULL THEN
      RAISE EXCEPTION
        'Pay policy version % is already closed (through %). A closed version''s dates never move.',
        OLD.id, OLD.effective_to
        USING ERRCODE = '42501';
    END IF;

    IF NEW.effective_to IS NULL THEN
      RAISE EXCEPTION
        'A pay policy version cannot be re-opened. Open a new version instead.'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.effective_to < COALESCE(OLD.effective_from, DATE '0001-01-01') THEN
      RAISE EXCEPTION
        'A pay policy version cannot end (%) before it began (%).',
        NEW.effective_to, OLD.effective_from
        USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission(auth.uid(), 'pay_policy.change') THEN
      RAISE EXCEPTION
        'Not authorized to close a pay policy version. Only the owner changes pay policy.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS ab_guard_pay_policy_append_only ON public.pay_policies;
CREATE TRIGGER ab_guard_pay_policy_append_only
  BEFORE UPDATE OR DELETE ON public.pay_policies
  FOR EACH ROW EXECUTE FUNCTION public.guard_pay_policy_append_only();

-- ---------------------------------------------------------------------------
-- Opening a new version: ONE owner-only RPC that closes the old version and
-- opens the new one in a single statement.
--
-- WHY a single RPC rather than two client writes: with the index re-scoped to
-- current versions, a new current version CANNOT be inserted while the old one
-- is still current. Two separate client calls therefore have a mandatory order
-- and a window in between where a failure would leave the company with NO
-- current pay policy at all — every dated reader would resolve zero rows and
-- settlements would stop. In one statement the pair is atomic, the new version
-- inherits every rate the owner did not change (so a later company-wide change
-- still reaches everything it should, P38), and the "new rate is a new version"
-- rule has exactly one writer to audit.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_pay_policy_version(
  _effective_from date,
  _rates jsonb DEFAULT '{}'::jsonb,
  _name text DEFAULT NULL,
  _description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_cur public.pay_policies;
  v_new_id uuid;
  v_key text;
  v_allowed text[] := ARRAY[
    'linehaul_pct','fsc_pct','detention_pct','layover_pct','tonu_pct','stopoff_pct',
    'lumper_reimbursement_pct','per_ton_pct','loadout_pct','other_accessorial_pct'
  ];
BEGIN
  IF NOT public.has_permission(auth.uid(), 'pay_policy.change') THEN
    RAISE EXCEPTION
      'Not authorized to change pay policy. Only the owner opens a new pay policy version.'
      USING ERRCODE = '42501';
  END IF;

  IF _effective_from IS NULL THEN
    RAISE EXCEPTION 'A new pay policy version needs the date it takes effect from.'
      USING ERRCODE = '22004';
  END IF;

  IF _effective_from < CURRENT_DATE THEN
    RAISE EXCEPTION
      'A pay policy version cannot start in the past (%). A past work week is always calculated with the rate that was in force for it.',
      _effective_from
      USING ERRCODE = '22007';
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(COALESCE(_rates, '{}'::jsonb)) LOOP
    IF NOT (v_key = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'Unknown pay policy rate "%".', v_key USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT * INTO v_cur
  FROM public.pay_policies
  WHERE company_id = public.current_company_id()
    AND is_company_default
    AND effective_to IS NULL
  FOR UPDATE;

  IF v_cur.id IS NULL THEN
    RAISE EXCEPTION 'No current company pay policy to supersede.' USING ERRCODE = 'P0002';
  END IF;

  IF _effective_from <= COALESCE(v_cur.effective_from, DATE '0001-01-01') THEN
    RAISE EXCEPTION
      'The new version must start after the current one began (%).', v_cur.effective_from
      USING ERRCODE = '22007';
  END IF;

  -- Close the current version the day before the new one starts, THEN open the
  -- new one: the re-scoped index allows only one current default at a time.
  UPDATE public.pay_policies
     SET effective_to = _effective_from - 1,
         updated_by = auth.uid()
   WHERE id = v_cur.id;

  INSERT INTO public.pay_policies (
    company_id, name, description, is_company_default, is_active,
    linehaul_pct, fsc_pct, detention_pct, layover_pct, tonu_pct, stopoff_pct,
    lumper_reimbursement_pct, per_ton_pct, loadout_pct, other_accessorial_pct,
    charge_pay_classes, fuel_discount_passthrough,
    effective_date, effective_from, effective_to, created_by, updated_by
  ) VALUES (
    v_cur.company_id,
    COALESCE(_name, v_cur.name),
    COALESCE(_description, v_cur.description),
    true,
    true,
    COALESCE((_rates->>'linehaul_pct')::numeric,             v_cur.linehaul_pct),
    COALESCE((_rates->>'fsc_pct')::numeric,                  v_cur.fsc_pct),
    COALESCE((_rates->>'detention_pct')::numeric,            v_cur.detention_pct),
    COALESCE((_rates->>'layover_pct')::numeric,              v_cur.layover_pct),
    COALESCE((_rates->>'tonu_pct')::numeric,                 v_cur.tonu_pct),
    COALESCE((_rates->>'stopoff_pct')::numeric,              v_cur.stopoff_pct),
    COALESCE((_rates->>'lumper_reimbursement_pct')::numeric, v_cur.lumper_reimbursement_pct),
    COALESCE((_rates->>'per_ton_pct')::numeric,              v_cur.per_ton_pct),
    COALESCE((_rates->>'loadout_pct')::numeric,              v_cur.loadout_pct),
    COALESCE((_rates->>'other_accessorial_pct')::numeric,    v_cur.other_accessorial_pct),
    v_cur.charge_pay_classes,
    v_cur.fuel_discount_passthrough,
    _effective_from,
    _effective_from,
    NULL,
    auth.uid(),
    auth.uid()
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$function$;

COMMENT ON FUNCTION public.open_pay_policy_version(date, jsonb, text, text) IS
  'Owner only (pay_policy.change). Closes the current company pay policy version the day before _effective_from and opens a new one inheriting every rate not named in _rates. The only writer that creates a pay policy version.';

REVOKE ALL ON FUNCTION public.open_pay_policy_version(date, jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_pay_policy_version(date, jsonb, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.open_pay_policy_version(date, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_pay_policy_version(date, jsonb, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.guard_pay_policy_append_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_pay_policy_append_only() FROM anon;
REVOKE ALL ON FUNCTION public.guard_pay_policy_append_only() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.guard_pay_policy_append_only() TO service_role;