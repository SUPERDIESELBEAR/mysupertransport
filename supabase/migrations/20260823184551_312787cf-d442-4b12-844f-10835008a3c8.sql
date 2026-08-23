-- 1. Single-transaction reference filing, actor resolved server-side.
CREATE OR REPLACE FUNCTION public.file_load_references(
  p_load_id uuid,
  p_refs jsonb,
  p_source text DEFAULT 'rate_confirmation',
  p_document_id uuid DEFAULT NULL,
  p_document_label text DEFAULT NULL,
  p_summary text DEFAULT NULL
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

REVOKE ALL ON FUNCTION public.file_load_references(uuid, jsonb, text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.file_load_references(uuid, jsonb, text, uuid, text, text) TO authenticated;

-- Superseded by file_load_references, which does the same write in one transaction.
DROP FUNCTION IF EXISTS public.record_load_reference_baseline(uuid, uuid, text, text);

-- 2. Verbatim verification stamps profile ids, not auth uids.
CREATE OR REPLACE FUNCTION public.set_load_verbatim_verification(p_load_id uuid, p_records jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_profile uuid := public.current_profile_id();
  v_records jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT (
    public.has_role(v_uid, 'management')
    OR public.has_role(v_uid, 'owner')
    OR public.has_role(v_uid, 'dispatcher')
    OR public.has_role(v_uid, 'onboarding_staff')
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'no profile for the current user';
  END IF;

  IF p_records IS NOT NULL AND jsonb_typeof(p_records) <> 'array' THEN
    RAISE EXCEPTION 'verbatim verification must be an array of field records';
  END IF;

  SELECT COALESCE(jsonb_agg(
           CASE
             WHEN rec->>'source' = 'manual_repair' AND (rec->>'repaired_at') IS NULL
               THEN rec || jsonb_build_object('repaired_at', now(), 'repaired_by', v_profile)
             ELSE rec
           END
         ), '[]'::jsonb)
    INTO v_records
    FROM jsonb_array_elements(COALESCE(p_records, '[]'::jsonb)) AS rec;

  UPDATE public.loads
     SET verbatim_verification = jsonb_build_object(
           'checked_at', now(),
           'checked_by', v_profile,
           'fields', COALESCE(v_records, '[]'::jsonb)
         ),
         updated_at = now(),
         updated_by = v_profile
   WHERE id = p_load_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'load not found';
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.set_load_verbatim_verification(uuid, jsonb) FROM anon;

-- 3. Diagnostics: attribute to the profile, and make a wrong actor impossible.
UPDATE public.parser_diagnostics d
   SET created_by = p.id
  FROM public.profiles p
 WHERE d.created_by IS NOT NULL AND p.user_id = d.created_by
   AND NOT EXISTS (SELECT 1 FROM public.profiles x WHERE x.id = d.created_by);
UPDATE public.parser_diagnostics d
   SET resolved_by = p.id
  FROM public.profiles p
 WHERE d.resolved_by IS NOT NULL AND p.user_id = d.resolved_by
   AND NOT EXISTS (SELECT 1 FROM public.profiles x WHERE x.id = d.resolved_by);
-- Anything still unresolvable becomes unattributed rather than blocking the FK.
UPDATE public.parser_diagnostics d SET created_by = NULL
 WHERE d.created_by IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.profiles x WHERE x.id = d.created_by);
UPDATE public.parser_diagnostics d SET resolved_by = NULL
 WHERE d.resolved_by IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.profiles x WHERE x.id = d.resolved_by);

ALTER TABLE public.parser_diagnostics
  ALTER COLUMN created_by SET DEFAULT public.current_profile_id();

ALTER TABLE public.parser_diagnostics
  ADD CONSTRAINT parser_diagnostics_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD CONSTRAINT parser_diagnostics_resolved_by_fkey
    FOREIGN KEY (resolved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Resolving a diagnostic stamps the profile server-side.
CREATE OR REPLACE FUNCTION public.resolve_parser_diagnostic(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile uuid := public.current_profile_id();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT (
    public.has_role(v_uid, 'dispatcher'::app_role)
    OR public.has_role(v_uid, 'management'::app_role)
    OR public.has_role(v_uid, 'owner'::app_role)
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.parser_diagnostics
     SET resolved_at = now(), resolved_by = v_profile
   WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_parser_diagnostic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_parser_diagnostic(uuid) TO authenticated;

-- 4. Clean up ST26034's half-filed baseline so it can be re-run from the UI.
DELETE FROM public.load_reference_citations c
 USING public.load_references r, public.loads l
 WHERE c.reference_id = r.id AND r.load_id = l.id AND l.load_number = 'ST26034';
DELETE FROM public.load_references r
 USING public.loads l
 WHERE r.load_id = l.id AND l.load_number = 'ST26034';