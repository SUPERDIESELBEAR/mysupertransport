DO $patch$
DECLARE
  src text;
  fn  text;
BEGIN
  -- create_load_with_stops ---------------------------------------------------
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_load_with_stops';
  IF src IS NULL THEN RAISE EXCEPTION 'create_load_with_stops not found'; END IF;

  fn := src;
  fn := replace(fn,
    E'loadout_relocation_fee, loadout_use_period_days,',
    E'loadout_relocation_fee, loadout_use_period_days, loadout_use_start, loadout_use_end,');
  fn := replace(fn,
    E'NULLIF(p_load->>''loadout_use_period_days'','''')::int,',
    E'NULLIF(p_load->>''loadout_use_period_days'','''')::int,\n    NULLIF(p_load->>''loadout_use_start'','''')::date,\n    NULLIF(p_load->>''loadout_use_end'','''')::date,');

  IF fn = src OR position('loadout_use_start'','''')::date' in fn) = 0 THEN
    RAISE EXCEPTION 'create_load_with_stops patch did not apply cleanly';
  END IF;
  EXECUTE fn;

  -- update_load_with_stops ---------------------------------------------------
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'update_load_with_stops';
  IF src IS NULL THEN RAISE EXCEPTION 'update_load_with_stops not found'; END IF;

  fn := src;
  fn := replace(fn,
    E'''loadout_use_period_days'', v_load.loadout_use_period_days::text,',
    E'''loadout_use_period_days'', v_load.loadout_use_period_days::text,\n    ''loadout_use_start'', v_load.loadout_use_start::text,\n    ''loadout_use_end'', v_load.loadout_use_end::text,');
  fn := replace(fn,
    E'loadout_use_period_days = nullif(v_new->>''loadout_use_period_days'','''')::int,',
    E'loadout_use_period_days = nullif(v_new->>''loadout_use_period_days'','''')::int,\n    loadout_use_start = nullif(v_new->>''loadout_use_start'','''')::date,\n    loadout_use_end = nullif(v_new->>''loadout_use_end'','''')::date,');

  IF fn = src
     OR position('loadout_use_start = nullif' in fn) = 0
     OR position('''loadout_use_start'', v_load' in fn) = 0 THEN
    RAISE EXCEPTION 'update_load_with_stops patch did not apply cleanly';
  END IF;
  EXECUTE fn;
END
$patch$;