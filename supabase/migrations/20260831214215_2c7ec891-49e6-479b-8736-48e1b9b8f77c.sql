CREATE OR REPLACE FUNCTION public.recompute_load_total_value(p_load_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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
      true, 'Recomputed after a charge change', public.current_profile_id()
    );
    UPDATE public.loads
       SET total_load_value = v_total, updated_at = now(),
           updated_by = public.current_profile_id()
     WHERE id = p_load_id;
  END IF;

  RETURN v_total;
END;
$function$;