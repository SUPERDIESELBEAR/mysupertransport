-- Carry the new verbatim columns and the load mode through the two save RPCs.
--
-- Both functions are long and hand-written; re-emitting them in full here would
-- be a copy that immediately drifts from the definition in the earlier
-- migration. Instead the live definition is patched in place, and every
-- substitution asserts it matched so a silent no-op fails the migration.
DO $patch$
DECLARE
  src text;
  fn  text;
  pairs text[][] := ARRAY[
    -- create_load_with_stops: loads insert
    ARRAY[
      E'    internal_notes, driver_facing_notes, special_instructions, created_by, updated_by',
      E'    internal_notes, driver_facing_notes, special_instructions,\n    special_instructions_verbatim, broker_terms_verbatim, mode, created_by, updated_by'
    ],
    ARRAY[
      E'    NULLIF(p_load->>''special_instructions''),\n    v_profile,',
      E'    NULLIF(p_load->>''special_instructions''),\n    v_profile,'
    ]
  ];
BEGIN
  -- create_load_with_stops -------------------------------------------------
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_load_with_stops';
  IF src IS NULL THEN RAISE EXCEPTION 'create_load_with_stops not found'; END IF;

  fn := src;
  fn := replace(fn,
    '    internal_notes, driver_facing_notes, special_instructions, created_by, updated_by',
    E'    internal_notes, driver_facing_notes, special_instructions,\n    special_instructions_verbatim, broker_terms_verbatim, mode, created_by, updated_by');
  fn := replace(fn,
    E'    NULLIF(p_load->>''special_instructions'',''''),\n    v_profile,',
    E'    NULLIF(p_load->>''special_instructions'',''''),\n    NULLIF(p_load->>''special_instructions_verbatim'',''''),\n    NULLIF(p_load->>''broker_terms_verbatim'',''''),\n    NULLIF(p_load->>''mode'',''''),\n    v_profile,');
  fn := replace(fn,
    E'reference_number, reference_label, stop_notes\n',
    E'reference_number, reference_label, stop_notes, stop_notes_verbatim\n');
  fn := replace(fn,
    E'      NULLIF(v_stop->>''stop_notes'','''')\n',
    E'      NULLIF(v_stop->>''stop_notes'',''''),\n      NULLIF(v_stop->>''stop_notes_verbatim'','''')\n');

  IF fn = src
     OR position('special_instructions_verbatim' in fn) = 0
     OR position('broker_terms_verbatim' in fn) = 0
     OR position('''mode''' in fn) = 0
     OR position('stop_notes_verbatim' in fn) = 0 THEN
    RAISE EXCEPTION 'create_load_with_stops patch did not apply cleanly';
  END IF;
  EXECUTE fn;

  -- update_load_with_stops -------------------------------------------------
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'update_load_with_stops';
  IF src IS NULL THEN RAISE EXCEPTION 'update_load_with_stops not found'; END IF;

  fn := src;
  -- snapshot used for the generic change-history diff
  fn := replace(fn,
    E'    ''special_instructions'', v_load.special_instructions,',
    E'    ''special_instructions'', v_load.special_instructions,\n    ''special_instructions_verbatim'', v_load.special_instructions_verbatim,\n    ''broker_terms_verbatim'', v_load.broker_terms_verbatim,\n    ''mode'', v_load.mode,');
  -- the write-back
  fn := replace(fn,
    E'    special_instructions = v_new->>''special_instructions'',',
    E'    special_instructions = v_new->>''special_instructions'',\n    special_instructions_verbatim = v_new->>''special_instructions_verbatim'',\n    broker_terms_verbatim = v_new->>''broker_terms_verbatim'',\n    mode = v_new->>''mode'',');
  -- existing stop update
  fn := replace(fn,
    E'        stop_notes = NULLIF(v_stop->>''stop_notes'',''''),',
    E'        stop_notes = NULLIF(v_stop->>''stop_notes'',''''),\n        stop_notes_verbatim = NULLIF(v_stop->>''stop_notes_verbatim'',''''),');
  -- per-stop change history keys
  fn := replace(fn,
    E'''reference_label'',''stopoff_charge_amount'',''stop_notes''] LOOP',
    E'''reference_label'',''stopoff_charge_amount'',''stop_notes'',\n                                   ''stop_notes_verbatim''] LOOP');
  -- new stop insert
  fn := replace(fn,
    E'reference_number, reference_label, stop_notes\n',
    E'reference_number, reference_label, stop_notes, stop_notes_verbatim\n');
  fn := replace(fn,
    E'        NULLIF(v_stop->>''stop_notes'','''')\n',
    E'        NULLIF(v_stop->>''stop_notes'',''''),\n        NULLIF(v_stop->>''stop_notes_verbatim'','''')\n');

  IF fn = src
     OR position('special_instructions_verbatim = v_new' in fn) = 0
     OR position('broker_terms_verbatim = v_new' in fn) = 0
     OR position('mode = v_new' in fn) = 0
     OR position('stop_notes_verbatim = NULLIF' in fn) = 0
     OR position('''stop_notes_verbatim''] LOOP' in fn) = 0 THEN
    RAISE EXCEPTION 'update_load_with_stops patch did not apply cleanly';
  END IF;
  EXECUTE fn;
END
$patch$;