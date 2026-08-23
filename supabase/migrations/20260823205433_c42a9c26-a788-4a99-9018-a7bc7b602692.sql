CREATE OR REPLACE FUNCTION public.file_load_references(
  p_load_id uuid,
  p_refs jsonb,
  p_source text DEFAULT 'rate_confirmation',
  p_document_id uuid DEFAULT NULL,
  p_document_label text DEFAULT NULL,
  p_summary text DEFAULT NULL,
  p_removals jsonb DEFAULT '[]'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile uuid := public.current_profile_id();
  v_ref jsonb;
  v_ref_id uuid;
  v_cite jsonb;
  v_rm jsonb;
  v_removed public.load_references%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT (
    public.has_role(v_uid, 'dispatcher'::app_role)
    OR public.has_role(v_uid, 'management'::app_role)
    OR public.has_role(v_uid, 'owner'::app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorized to file reference numbers on a load';
  END IF;
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'no profile for the current user';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.loads WHERE id = p_load_id) THEN
    RAISE EXCEPTION 'Load not found';
  END IF;
  IF p_refs IS NULL OR jsonb_typeof(p_refs) <> 'array' THEN
    RAISE EXCEPTION 'references must be an array';
  END IF;
  IF p_removals IS NOT NULL AND jsonb_typeof(p_removals) <> 'array' THEN
    RAISE EXCEPTION 'removals must be an array';
  END IF;

  FOR v_ref IN SELECT * FROM jsonb_array_elements(p_refs) LOOP
    INSERT INTO public.load_references (
      load_id, reference_class, label, value, value_key, source, created_by
    ) VALUES (
      p_load_id,
      v_ref->>'reference_class',
      COALESCE(NULLIF(v_ref->>'label',''), v_ref->>'reference_class'),
      v_ref->>'value',
      v_ref->>'value_key',
      COALESCE(NULLIF(p_source,''), 'rate_confirmation'),
      v_profile
    )
    ON CONFLICT (load_id, reference_class, value_key)
      DO UPDATE SET label = EXCLUDED.label, value = EXCLUDED.value, source = EXCLUDED.source
    RETURNING id INTO v_ref_id;

    -- The document is the authority on where a number is printed, so the
    -- citations for this reference are rewritten wholesale.
    DELETE FROM public.load_reference_citations WHERE reference_id = v_ref_id;

    FOR v_cite IN SELECT * FROM jsonb_array_elements(COALESCE(v_ref->'citations', '[]'::jsonb)) LOOP
      INSERT INTO public.load_reference_citations (
        reference_id, load_stop_id, stop_sequence, printed_label
      ) VALUES (
        v_ref_id,
        (SELECT s.id FROM public.load_stops s
          WHERE s.load_id = p_load_id
            AND s.stop_sequence = (v_cite->>'stopSequence')::int
          LIMIT 1),
        (v_cite->>'stopSequence')::int,
        COALESCE(
          NULLIF(TRIM(COALESCE(v_cite->>'printedLabel','')), ''),
          NULLIF(v_ref->>'label',''),
          v_ref->>'reference_class'
        )
      );
    END LOOP;
  END LOOP;

  -- Removals. A reference the revised document no longer prints is deleted
  -- here, in the same transaction as the writes: an accepted "reference
  -- removed" row that changed nothing left an outdated number on file and
  -- reappeared on every later review.
  FOR v_rm IN SELECT * FROM jsonb_array_elements(COALESCE(p_removals, '[]'::jsonb)) LOOP
    DELETE FROM public.load_references r
     WHERE r.load_id = p_load_id
       AND r.reference_class = v_rm->>'reference_class'
       AND r.value_key = v_rm->>'value_key'
    RETURNING r.* INTO v_removed;

    IF v_removed.id IS NOT NULL THEN
      -- Citations go with it (FK is ON DELETE CASCADE), so the stop notes for a
      -- deleted number cannot linger behind it.
      INSERT INTO public.load_change_history (
        load_id, field_path, previous_value, new_value, is_financial, reason, change_source, changed_by
      ) VALUES (
        p_load_id,
        'references.' || v_removed.reference_class,
        v_removed.label || ': ' || v_removed.value,
        NULL,
        false,
        'Reference removed from '
          || COALESCE(NULLIF(p_document_label, ''), 'a revised rate confirmation'),
        COALESCE(NULLIF(p_source, ''), 'rate_confirmation'),
        v_profile
      );
      v_removed := NULL;
    END IF;
  END LOOP;

  IF p_summary IS NOT NULL AND TRIM(p_summary) <> '' THEN
    INSERT INTO public.load_change_history (
      load_id, field_path, previous_value, new_value, is_financial, reason, change_source, changed_by
    ) VALUES (
      p_load_id,
      'references.baseline',
      'No reference numbers on file',
      p_summary,
      false,
      'Reference baseline filed from '
        || COALESCE(NULLIF(p_document_label, ''), 'a rate confirmation')
        || COALESCE(' (document ' || p_document_id::text || ')', ''),
      'reference_baseline',
      v_profile
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.file_load_references(uuid, jsonb, text, uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.file_load_references(uuid, jsonb, text, uuid, text, text, jsonb) TO authenticated;

-- The 6-argument form is superseded; one signature only, so a caller cannot
-- silently reach a version that ignores removals.
DROP FUNCTION IF EXISTS public.file_load_references(uuid, jsonb, text, uuid, text, text);