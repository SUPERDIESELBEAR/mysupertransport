-- PER-DRIVER PAY, PASS 3 OF 5 — each driver's linehaul percentage, versioned.
--
-- Pass 1 date-tested every pay-rate reader; Pass 2 made the COMPANY policy
-- append-only and versioned. This pass gives a DRIVER his own dated linehaul
-- percentage — and only linehaul (P38). Every other rate keeps resolving from
-- the company version in force, so a later company-wide change to detention
-- still reaches everyone.
--
-- ORDERING NOTE: the backfill runs BEFORE the company-stamp trigger is created.
-- stamp_tenant_company_id() resolves the caller's company_members row and
-- refuses when there is none — correct, fail-closed behaviour — and a migration
-- has no JWT. The backfill therefore names each driver's own company_id
-- explicitly, then the trigger is attached for every later insert.

CREATE TABLE public.operator_linehaul_pct_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.carrier_profile(id) ON DELETE RESTRICT,
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  pct numeric(5,2) NOT NULL CHECK (pct >= 0 AND pct <= 100),
  effective_from date NOT NULL,
  effective_to date,
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  -- A PROFILE id, via current_profile_id() — not auth.uid(). Migration 0039
  -- exists because that distinction was got wrong once already.
  actor uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('driver_page', 'agreement', 'backfill')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operator_linehaul_pct_versions_window
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

COMMENT ON TABLE public.operator_linehaul_pct_versions IS
  'A driver''s linehaul percentage, versioned by date (P38, P41). ONLY linehaul is overridable per driver; every other rate resolves from the company pay policy version in force. Append-only: written solely by set_operator_linehaul_pct().';
COMMENT ON COLUMN public.operator_linehaul_pct_versions.effective_to IS
  'NULL = the current version. A date = the last day this version governed. A past work week is always paid at the version in force for it.';

GRANT SELECT ON public.operator_linehaul_pct_versions TO authenticated;
GRANT ALL ON public.operator_linehaul_pct_versions TO service_role;

ALTER TABLE public.operator_linehaul_pct_versions ENABLE ROW LEVEL SECURITY;

-- Reads: management and the owner only. A driver is NEVER shown a percentage
-- or a gross (driverLoadPay.ts, operator-pay-exposure), and a dispatcher has no
-- business in driver pay. No INSERT/UPDATE/DELETE policy exists at all: the one
-- writer is a SECURITY DEFINER RPC, so a direct client write matches no policy
-- and is refused.
CREATE POLICY "Management reads driver linehaul versions"
  ON public.operator_linehaul_pct_versions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'management'::app_role)
         OR public.has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY tenant_isolation
  ON public.operator_linehaul_pct_versions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

-- One CURRENT version per driver. Any number of closed ones.
CREATE UNIQUE INDEX operator_linehaul_pct_single_current
  ON public.operator_linehaul_pct_versions (operator_id)
  WHERE effective_to IS NULL;

CREATE INDEX operator_linehaul_pct_lookup
  ON public.operator_linehaul_pct_versions (operator_id, effective_from DESC);

-- STEP 2 — the backfill: ONE version per driver, at the percentage his driver
-- record already carries, from a date before every settlement this carrier has
-- ever run (the same 2000-01-01 the company policy's version one was backfilled
-- to in 0037). Every figure therefore resolves to exactly what it resolves to
-- today.
INSERT INTO public.operator_linehaul_pct_versions
  (company_id, operator_id, pct, effective_from, effective_to, reason, actor, source)
SELECT o.company_id, o.id, o.pay_percentage, DATE '2000-01-01', NULL,
       'Backfilled from the driver record when per-driver pay history began (Pass 3).',
       NULL, 'backfill'
FROM public.operators o;

CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.operator_linehaul_pct_versions
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

CREATE TRIGGER update_operator_linehaul_pct_updated_at
  BEFORE UPDATE ON public.operator_linehaul_pct_versions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- The append-only guard, mirroring guard_pay_policy_append_only (0038).
CREATE OR REPLACE FUNCTION public.guard_operator_linehaul_pct_append_only()
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
      'A driver''s linehaul percentage version is never deleted. Set a new percentage from a date instead; past settlements are paid at the rate in force for their week.'
      USING ERRCODE = '42501';
  END IF;

  v_frozen := CASE
    WHEN NEW.pct            IS DISTINCT FROM OLD.pct            THEN 'pct'
    WHEN NEW.effective_from IS DISTINCT FROM OLD.effective_from  THEN 'effective_from'
    WHEN NEW.operator_id    IS DISTINCT FROM OLD.operator_id     THEN 'operator_id'
    WHEN NEW.company_id     IS DISTINCT FROM OLD.company_id      THEN 'company_id'
    WHEN NEW.source         IS DISTINCT FROM OLD.source          THEN 'source'
    WHEN NEW.reason         IS DISTINCT FROM OLD.reason          THEN 'reason'
    WHEN NEW.actor          IS DISTINCT FROM OLD.actor           THEN 'actor'
    WHEN NEW.created_at     IS DISTINCT FROM OLD.created_at      THEN 'created_at'
    ELSE NULL
  END;

  IF v_frozen IS NOT NULL THEN
    RAISE EXCEPTION
      'A driver linehaul percentage version is append-only: % cannot change on an existing version (%). A new percentage is a NEW version, effective from a date.',
      v_frozen, OLD.id
      USING ERRCODE = '42501';
  END IF;

  IF NEW.effective_to IS DISTINCT FROM OLD.effective_to THEN
    IF OLD.effective_to IS NOT NULL THEN
      RAISE EXCEPTION
        'Linehaul percentage version % is already closed (through %). A closed version''s dates never move.',
        OLD.id, OLD.effective_to
        USING ERRCODE = '42501';
    END IF;

    IF NEW.effective_to IS NULL THEN
      RAISE EXCEPTION 'A linehaul percentage version cannot be re-opened. Set a new percentage instead.'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.effective_to < OLD.effective_from THEN
      RAISE EXCEPTION 'A linehaul percentage version cannot end (%) before it began (%).',
        NEW.effective_to, OLD.effective_from
        USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission(auth.uid(), 'driver_pay.change') THEN
      RAISE EXCEPTION
        'Not authorized to change a driver''s pay percentage. Only the owner can change a driver''s contracted pay.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_operator_linehaul_pct_append_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_operator_linehaul_pct_append_only() FROM anon;
REVOKE ALL ON FUNCTION public.guard_operator_linehaul_pct_append_only() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.guard_operator_linehaul_pct_append_only() TO service_role;

CREATE TRIGGER ab_guard_operator_linehaul_pct_append_only
  BEFORE UPDATE OR DELETE ON public.operator_linehaul_pct_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_operator_linehaul_pct_append_only();

-- ---------------------------------------------------------------------------
-- STEP 3 — ONE owner-only writer.
--
-- Closes the current version the day before the new one starts and opens the new
-- one in a single statement, for the reason 0038 gives for the company policy:
-- the one-current-version index makes two client writes impossible to order
-- safely, and a gap with no current version is a driver with no linehaul rate.
--
-- THE MIRROR. `operators.pay_percentage` stays the CURRENT value, because the
-- driver's earnings forecast reads it and nothing else. It is written here only
-- when the new version starts today or earlier. A FUTURE-dated version leaves it
-- alone — today's forecast must keep showing today's rate — and
-- sync_operator_linehaul_pct_mirror(), run daily by cron just after midnight
-- Central, moves it on the morning the version takes effect.
--
-- A fractional percentage is refused: `operators.pay_percentage` is an integer
-- column, and rounding into the mirror would make the forecast disagree with the
-- settlement. When that column becomes numeric, this check goes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_operator_linehaul_pct(
  _operator_id uuid,
  _pct numeric,
  _effective_from date,
  _reason text,
  _source text DEFAULT 'driver_page'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_company uuid;
  v_cur public.operator_linehaul_pct_versions;
  v_new_id uuid;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'driver_pay.change') THEN
    RAISE EXCEPTION
      'Not authorized to change a driver''s pay percentage. Only the owner can change a driver''s contracted pay.'
      USING ERRCODE = '42501';
  END IF;

  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'A pay percentage change needs a reason. It is recorded with the version.'
      USING ERRCODE = '22004';
  END IF;

  IF _effective_from IS NULL THEN
    RAISE EXCEPTION 'A pay percentage change needs the date it takes effect from.'
      USING ERRCODE = '22004';
  END IF;

  IF _pct IS NULL OR _pct < 0 OR _pct > 100 THEN
    RAISE EXCEPTION 'A linehaul percentage must be between 0 and 100 (got %).', _pct
      USING ERRCODE = '22023';
  END IF;

  IF _pct <> round(_pct) THEN
    RAISE EXCEPTION
      'A linehaul percentage must be a whole number (got %). The driver record that the earnings forecast reads stores whole percentages.',
      _pct
      USING ERRCODE = '22023';
  END IF;

  IF _source IS NULL OR _source NOT IN ('driver_page', 'agreement') THEN
    RAISE EXCEPTION 'A percentage change comes from the driver page or the agreement (got %).', _source
      USING ERRCODE = '22023';
  END IF;

  IF _effective_from < CURRENT_DATE THEN
    RAISE EXCEPTION
      'A pay percentage cannot start in the past (%). A past work week is always paid at the rate that was in force for it.',
      _effective_from
      USING ERRCODE = '22007';
  END IF;

  SELECT company_id INTO v_company FROM public.operators WHERE id = _operator_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'No such driver (%).', _operator_id USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_cur
  FROM public.operator_linehaul_pct_versions
  WHERE operator_id = _operator_id AND effective_to IS NULL
  FOR UPDATE;

  IF v_cur.id IS NOT NULL THEN
    IF _effective_from <= v_cur.effective_from THEN
      RAISE EXCEPTION
        'The new percentage must start after the current one began (%).', v_cur.effective_from
        USING ERRCODE = '22007';
    END IF;

    UPDATE public.operator_linehaul_pct_versions
       SET effective_to = _effective_from - 1
     WHERE id = v_cur.id;
  END IF;

  INSERT INTO public.operator_linehaul_pct_versions
    (company_id, operator_id, pct, effective_from, effective_to, reason, actor, source)
  VALUES (v_company, _operator_id, _pct, _effective_from, NULL, btrim(_reason), v_actor, _source)
  RETURNING id INTO v_new_id;

  IF _effective_from <= CURRENT_DATE THEN
    UPDATE public.operators
       SET pay_percentage = _pct::int
     WHERE id = _operator_id
       AND pay_percentage IS DISTINCT FROM _pct::int;
  END IF;

  RETURN v_new_id;
END;
$function$;

COMMENT ON FUNCTION public.set_operator_linehaul_pct(uuid, numeric, date, text, text) IS
  'Owner only (driver_pay.change). The ONLY writer of operator_linehaul_pct_versions: closes the driver''s current version the day before _effective_from and opens the new one in one statement, with a required reason. No back-dating. Mirrors operators.pay_percentage only when the new version starts today or earlier; sync_operator_linehaul_pct_mirror() catches the mirror up on a future start date.';

REVOKE ALL ON FUNCTION public.set_operator_linehaul_pct(uuid, numeric, date, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_operator_linehaul_pct(uuid, numeric, date, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_operator_linehaul_pct(uuid, numeric, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_operator_linehaul_pct(uuid, numeric, date, text, text) TO service_role;

-- The mirror catch-up. Idempotent, so running it twice in a day is harmless, and
-- it repairs any drift rather than only the day's change.
CREATE OR REPLACE FUNCTION public.sync_operator_linehaul_pct_mirror()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_count integer;
BEGIN
  WITH in_force AS (
    SELECT v.operator_id, v.pct
    FROM public.operator_linehaul_pct_versions v
    WHERE v.effective_from <= CURRENT_DATE
      AND (v.effective_to IS NULL OR v.effective_to >= CURRENT_DATE)
  ), moved AS (
    UPDATE public.operators o
       SET pay_percentage = f.pct::int
      FROM in_force f
     WHERE o.id = f.operator_id
       AND o.pay_percentage IS DISTINCT FROM f.pct::int
    RETURNING o.id
  )
  SELECT count(*) INTO v_count FROM moved;
  RETURN v_count;
END;
$function$;

COMMENT ON FUNCTION public.sync_operator_linehaul_pct_mirror() IS
  'Brings operators.pay_percentage (the convenience mirror the earnings forecast reads) up to the linehaul version in force today. Run daily by cron just after midnight Central so a future-dated change reaches the forecast on the day it starts.';

REVOKE ALL ON FUNCTION public.sync_operator_linehaul_pct_mirror() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_operator_linehaul_pct_mirror() FROM anon;
REVOKE ALL ON FUNCTION public.sync_operator_linehaul_pct_mirror() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sync_operator_linehaul_pct_mirror() TO service_role;

SELECT cron.unschedule('sync-operator-linehaul-pct-mirror')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-operator-linehaul-pct-mirror');

SELECT cron.schedule(
  'sync-operator-linehaul-pct-mirror',
  '10 5 * * *',
  $cron$SELECT public.sync_operator_linehaul_pct_mirror();$cron$
);