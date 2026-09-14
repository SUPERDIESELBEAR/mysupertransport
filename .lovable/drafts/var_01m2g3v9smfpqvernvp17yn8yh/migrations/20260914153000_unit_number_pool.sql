-- Unit number pool: what is taken, what came back from a pre-Go-Live wash-out,
-- and what the next number in sequence is.
--
-- Release is DERIVED, never recorded: a number is free because its holder has
-- no go_live_date and is off the roster. Nothing writes a "released" row, so
-- un-archiving a driver correctly re-reserves his number with no extra work.
--
-- Bounds and excluded values are configuration, not constants — 000/1900/1901
-- were test numbers and must never drag `next` up to 1902.

-- 1. Configuration, one row per company.
CREATE TABLE IF NOT EXISTS public.unit_number_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.carrier_profile(id) ON DELETE RESTRICT,
  sequence_min integer NOT NULL DEFAULT 190,
  sequence_max_offered integer NOT NULL DEFAULT 999,
  excluded_units text[] NOT NULL DEFAULT ARRAY['000', '1900', '1901'],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS unit_number_config_one_per_company
  ON public.unit_number_config (company_id);

GRANT SELECT, UPDATE ON public.unit_number_config TO authenticated;
GRANT ALL ON public.unit_number_config TO service_role;

ALTER TABLE public.unit_number_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Onboarding staff and management read unit number config" ON public.unit_number_config;
CREATE POLICY "Onboarding staff and management read unit number config"
  ON public.unit_number_config FOR SELECT TO authenticated
  USING (
    company_id = public.current_company_id()
    AND (
      public.has_role(auth.uid(), 'onboarding_staff')
      OR public.has_role(auth.uid(), 'management')
      OR public.has_role(auth.uid(), 'owner')
    )
  );

DROP POLICY IF EXISTS "Management changes unit number config" ON public.unit_number_config;
CREATE POLICY "Management changes unit number config"
  ON public.unit_number_config FOR UPDATE TO authenticated
  USING (
    company_id = public.current_company_id()
    AND (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
  )
  WITH CHECK (
    company_id = public.current_company_id()
    AND (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
  );

-- Seed before the stamping trigger exists: the migration runs with no
-- authenticated caller, so current_company_id() would resolve NULL here.
INSERT INTO public.unit_number_config (company_id)
SELECT cp.id FROM public.carrier_profile cp
WHERE NOT EXISTS (
  SELECT 1 FROM public.unit_number_config u WHERE u.company_id = cp.id
);

DROP TRIGGER IF EXISTS stamp_company_unit_number_config ON public.unit_number_config;
CREATE TRIGGER stamp_company_unit_number_config
  BEFORE INSERT ON public.unit_number_config
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

DROP TRIGGER IF EXISTS touch_unit_number_config ON public.unit_number_config;
CREATE TRIGGER touch_unit_number_config
  BEFORE UPDATE ON public.unit_number_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Who holds a given unit number, and in what state.
CREATE OR REPLACE FUNCTION public.unit_number_holders(_unit text)
RETURNS TABLE (
  operator_id uuid,
  driver_name text,
  is_active boolean,
  go_live_date date,
  deactivated_at timestamptz,
  state text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'onboarding_staff')
    OR public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
  ) THEN
    RAISE EXCEPTION 'Only onboarding staff and management may look up unit number holders.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    btrim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')),
    o.is_active,
    s.go_live_date,
    o.deactivated_at,
    CASE
      WHEN s.go_live_date IS NOT NULL AND o.is_active THEN 'live'
      WHEN s.go_live_date IS NOT NULL THEN 'departed'
      WHEN o.is_active AND o.deactivated_at IS NULL THEN 'onboarding'
      ELSE 'released'
    END
  FROM public.operators o
  LEFT JOIN public.onboarding_status s ON s.operator_id = o.id
  LEFT JOIN public.profiles p ON p.user_id = o.user_id
  WHERE o.company_id = public.current_company_id()
    AND public.operator_unit_number(s.unit_number, o.unit_number) = btrim(COALESCE(_unit, ''))
    AND btrim(COALESCE(_unit, '')) <> '';
END;
$$;

REVOKE ALL ON FUNCTION public.unit_number_holders(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unit_number_holders(text) TO authenticated, service_role;

-- 3. The pool itself.
CREATE OR REPLACE FUNCTION public.unit_number_pool()
RETURNS TABLE (
  unit integer,
  kind text,
  freed_at timestamptz,
  note text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_company uuid := public.current_company_id();
  v_min integer;
  v_max_offered integer;
  v_excluded text[];
  v_ceiling integer;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'onboarding_staff')
    OR public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
  ) THEN
    RAISE EXCEPTION 'Only onboarding staff and management may read the unit number pool.'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.sequence_min, c.sequence_max_offered, c.excluded_units
    INTO v_min, v_max_offered, v_excluded
  FROM public.unit_number_config c
  WHERE c.company_id = v_company;

  IF v_min IS NULL THEN
    RAISE EXCEPTION 'No unit number configuration exists for this company.'
      USING ERRCODE = '42501';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _unit_scratch (
    n integer,
    taken boolean,
    freed_at timestamptz
  ) ON COMMIT DROP;
  DELETE FROM _unit_scratch;

  INSERT INTO _unit_scratch (n, taken, freed_at)
  WITH holders AS (
    SELECT
      public.operator_unit_number(s.unit_number, o.unit_number) AS u,
      o.is_active,
      o.deactivated_at,
      s.go_live_date
    FROM public.operators o
    LEFT JOIN public.onboarding_status s ON s.operator_id = o.id
    WHERE o.company_id = v_company
      AND COALESCE(o.is_demo, false) = false
  ), numbered AS (
    SELECT (u)::integer AS n, is_active, deactivated_at, go_live_date
    FROM holders
    WHERE u ~ '^[0-9]+$'
      AND NOT (u = ANY (v_excluded))
  )
  SELECT
    n,
    -- Taken: went live at all, or still on the roster, or onboarding is open.
    bool_or(go_live_date IS NOT NULL OR is_active),
    -- Freed: the oldest wash-out that gave this number up.
    min(deactivated_at) FILTER (WHERE go_live_date IS NULL AND NOT is_active)
  FROM numbered
  GROUP BY n;

  SELECT GREATEST(COALESCE(max(s.n), v_min - 1), v_min - 1) INTO v_ceiling FROM _unit_scratch s;

  RETURN QUERY
  -- Recycled: freed by a pre-Go-Live wash-out and held by nobody live.
  SELECT s.n, 'recycled'::text, s.freed_at,
         'Freed by a driver who never reached Go-Live'::text
  FROM _unit_scratch s
  WHERE NOT s.taken
  UNION ALL
  -- Gaps: inside the sequence and never issued.
  SELECT g.i, 'gap'::text, NULL::timestamptz, 'Never issued'::text
  FROM generate_series(v_min, v_ceiling) g(i)
  WHERE NOT EXISTS (SELECT 1 FROM _unit_scratch s WHERE s.n = g.i)
    AND NOT (g.i::text = ANY (v_excluded))
  UNION ALL
  -- Next in sequence.
  SELECT v_ceiling + 1, 'next'::text, NULL::timestamptz, 'Next in sequence'::text
  WHERE v_ceiling + 1 <= v_max_offered
  ORDER BY 2 ASC, 3 ASC NULLS LAST, 1 ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.unit_number_pool() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unit_number_pool() TO authenticated, service_role;
