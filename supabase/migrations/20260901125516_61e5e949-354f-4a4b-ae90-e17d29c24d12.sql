-- fsc_bundled_into_linehaul is a tri-state: NULL and true both mean "bundled
-- into the linehaul rate" (recompute_load_total_value coalesces it to true).
-- update_load_with_stops coerced NULL to false on save, so every edit of such a
-- load produced a spurious FINANCIAL diff and demanded a reason -- training
-- people to type a reason reflexively and eroding the guard.
--
-- Two changes, both surgical against the live definition:
--   (a) drop the key out of the boolean coercion loop, so the generic
--       nullif(p_load->>key,'') path keeps '' -> NULL;
--   (b) normalise the diff so NULL and true compare equal for this key only.
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
    'FOREACH v_key IN ARRAY ARRAY[''fsc_bundled_into_linehaul'',''reefer_precool_required'',',
    'FOREACH v_key IN ARRAY ARRAY[''reefer_precool_required'',');

  v_src := replace(v_src,
    '    v_a := v_old->>v_key;
    v_b := v_new->>v_key;',
    '    v_a := v_old->>v_key;
    v_b := v_new->>v_key;
    -- Tri-state: unstated means bundled. Only a real true -> false (or back)
    -- is a change worth a reason.
    IF v_key = ''fsc_bundled_into_linehaul'' THEN
      v_a := coalesce(v_a, ''true'');
      v_b := coalesce(v_b, ''true'');
    END IF;');

  IF v_src LIKE '%ARRAY[''fsc_bundled_into_linehaul''%'
     OR v_src NOT LIKE '%v_a := coalesce(v_a, ''true'');%' THEN
    RAISE EXCEPTION 'fsc tri-state rewrite did not apply cleanly';
  END IF;

  EXECUTE v_src;
END;
$do$;