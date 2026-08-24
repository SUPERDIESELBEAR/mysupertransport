DO $patch$
DECLARE
  src text;
  fn  text;
BEGIN
  -- The window source is written by the same save path as the window itself.
  -- Without it, a derived window saved as if the broker had stated it, and the
  -- provenance line on Load Detail disappeared on the first save.

  -- create_load_with_stops ---------------------------------------------------
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_load_with_stops';
  IF src IS NULL THEN RAISE EXCEPTION 'create_load_with_stops not found'; END IF;

  fn := src;
  fn := replace(fn,
    E'loadout_use_start, loadout_use_end,',
    E'loadout_use_start, loadout_use_end, loadout_use_window_source,');
  fn := replace(fn,
    E'NULLIF(p_load->>''loadout_use_end'','''')::date,',
    E'NULLIF(p_load->>''loadout_use_end'','''')::date,\n    NULLIF(p_load->>''loadout_use_window_source'',''''),');

  IF fn = src OR position('loadout_use_window_source'','''')' in fn) = 0 THEN
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
    E'''loadout_use_end'', v_load.loadout_use_end::text,',
    E'''loadout_use_end'', v_load.loadout_use_end::text,\n    ''loadout_use_window_source'', v_load.loadout_use_window_source,');
  fn := replace(fn,
    E'loadout_use_end = nullif(v_new->>''loadout_use_end'','''')::date,',
    E'loadout_use_end = nullif(v_new->>''loadout_use_end'','''')::date,\n    loadout_use_window_source = nullif(v_new->>''loadout_use_window_source'',''''),');

  IF fn = src
     OR position('loadout_use_window_source = nullif' in fn) = 0
     OR position('''loadout_use_window_source'', v_load' in fn) = 0 THEN
    RAISE EXCEPTION 'update_load_with_stops patch did not apply cleanly';
  END IF;
  EXECUTE fn;
END
$patch$;