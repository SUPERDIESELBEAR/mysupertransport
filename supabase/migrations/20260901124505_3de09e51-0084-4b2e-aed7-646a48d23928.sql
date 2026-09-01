-- 1. ONE implementation of what a load is worth. Re-created with an optional
--    reason so an edit's written reason travels onto the total_load_value
--    history row instead of the generic charge-change wording. The single-arg
--    callers (add/update/delete_load_charge) keep working via the default.
DROP FUNCTION IF EXISTS public.recompute_load_total_value(uuid);

CREATE FUNCTION public.recompute_load_total_value(
  p_load_id uuid,
  p_reason text DEFAULT 'Recomputed after a charge change'
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_load public.loads;
  v_charge_sum numeric := 0;
  v_base numeric := 0;
  v_total numeric := 0;
BEGIN
  SELECT * INTO v_load FROM public.loads WHERE id = p_load_id;
  IF v_load.id IS NULL THEN
    RAISE EXCEPTION 'Load not found';
  END IF;

  SELECT coalesce(sum(amount), 0) INTO v_charge_sum
    FROM public.load_charges WHERE load_id = p_load_id;

  IF v_load.load_type = 'loadout' THEN
    v_total := coalesce(v_load.loadout_relocation_fee, 0);
  ELSE
    v_base := CASE v_load.rate_type::text
      WHEN 'per_mile' THEN coalesce(v_load.rate_per_mile, 0) * coalesce(v_load.loaded_miles, 0)
      -- Per-ton bulk is paid on what actually crossed the scale. The scale
      -- ticket is authoritative; estimated tons is only what everyone thought
      -- before loading, and is used solely so a load still in flight shows a
      -- working total instead of zero. Driver pay never falls back this way.
      WHEN 'per_ton'  THEN coalesce(v_load.rate_per_ton, 0)
                           * coalesce(v_load.confirmed_tons, v_load.estimated_tons, 0)
      ELSE coalesce(v_load.linehaul_rate, 0)
    END;
    v_total := v_base
      + CASE WHEN coalesce(v_load.fsc_bundled_into_linehaul, true)
             THEN 0 ELSE coalesce(v_load.fsc_amount, 0) END
      + v_charge_sum;
  END IF;

  v_total := round(v_total, 2);

  IF v_load.total_load_value IS DISTINCT FROM v_total THEN
    INSERT INTO public.load_change_history (
      load_id, field_path, previous_value, new_value, is_financial, reason, changed_by
    ) VALUES (
      p_load_id, 'total_load_value', v_load.total_load_value::text, v_total::text,
      true, coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Recomputed after a charge change'),
      public.current_profile_id()
    );
    UPDATE public.loads
       SET total_load_value = v_total, updated_at = now(),
           updated_by = public.current_profile_id()
     WHERE id = p_load_id;
  END IF;

  RETURN v_total;
END;
$function$;

REVOKE ALL ON FUNCTION public.recompute_load_total_value(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_load_total_value(uuid, text) TO authenticated;

-- 2. Re-point update_load_with_stops at that one implementation. The body is
--    rewritten from the live definition so nothing else in this large function
--    can drift: the edits are (a) carry confirmed_tons through the diff and the
--    write, (b) delete the inline per-ton total that multiplied ESTIMATED tons,
--    (c) call recompute_load_total_value once the row is written.
DO $do$
DECLARE
  v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'update_load_with_stops';
  IF v_src IS NULL THEN
    RAISE EXCEPTION 'update_load_with_stops not found';
  END IF;

  v_src := replace(v_src,
    '''weight_lbs'',''linehaul_rate'',''rate_per_mile'',''rate_per_ton'',''estimated_tons'',''fsc_amount'',',
    '''weight_lbs'',''linehaul_rate'',''rate_per_mile'',''rate_per_ton'',''estimated_tons'',''confirmed_tons'',''fsc_amount'',');

  v_src := replace(v_src,
    '''rate_type'',''linehaul_rate'',''rate_per_mile'',''rate_per_ton'',''estimated_tons'',',
    '''rate_type'',''linehaul_rate'',''rate_per_mile'',''rate_per_ton'',''estimated_tons'',''confirmed_tons'',');

  v_src := replace(v_src,
    '''estimated_tons'', v_load.estimated_tons::text,',
    '''estimated_tons'', v_load.estimated_tons::text,
    ''confirmed_tons'', v_load.confirmed_tons::text,');

  v_src := replace(v_src,
    'estimated_tons = nullif(v_new->>''estimated_tons'','''')::numeric,',
    'estimated_tons = nullif(v_new->>''estimated_tons'','''')::numeric,
    confirmed_tons = nullif(v_new->>''confirmed_tons'','''')::numeric,');

  -- (b) the defect: a second reader of the same money, using estimated tons.
  v_src := regexp_replace(v_src,
    'IF \(v_new->>''load_type''\) = ''loadout'' THEN(.|\n)*?UPDATE public\.loads SET',
    '-- The total is NOT computed here. public.recompute_load_total_value is the
  -- single implementation of what a load is worth, and the only one that knows
  -- the scale ticket beats the estimate. It is called below.
  UPDATE public.loads SET');

  v_src := replace(v_src, '    total_load_value = v_total,
', '');

  -- (c) one reader of the money, after the row is written.
  v_src := replace(v_src, '  UPDATE public.facilities f',
    '  v_total := public.recompute_load_total_value(p_load_id, v_reason);

  UPDATE public.facilities f');

  IF v_src NOT LIKE '%recompute_load_total_value(p_load_id, v_reason)%'
     OR v_src NOT LIKE '%confirmed_tons = nullif%'
     OR v_src LIKE '%total_load_value = v_total,%'
     OR v_src LIKE '%v_new->>''estimated_tons'','''')::numeric, 0)%' THEN
    RAISE EXCEPTION 'update_load_with_stops rewrite did not apply cleanly';
  END IF;

  EXECUTE v_src;
END;
$do$;