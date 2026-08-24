-- Cause 4 on the diagnostics write path.
--
-- A column DEFAULT and an RLS policy expression both evaluate in the CALLER's
-- context. parser_diagnostics.created_by defaulted to public.current_profile_id()
-- and the insert policy compared created_by to it -- but EXECUTE on that function
-- was deliberately revoked from authenticated on 2026-08-20 (it was, correctly at
-- the time, an internal helper called only from SECURITY DEFINER bodies). Every
-- client insert therefore died with 42501 "permission denied for function
-- current_profile_id" before RLS or row shape could matter.
--
-- The revoke stands. The write moves behind a definer RPC, like every other
-- actor-stamped write in this project.

CREATE OR REPLACE FUNCTION public.log_parser_diagnostics(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile uuid := public.current_profile_id();
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT (
    public.has_role(v_uid, 'dispatcher'::app_role)
    OR public.has_role(v_uid, 'management'::app_role)
    OR public.has_role(v_uid, 'owner'::app_role)
    OR public.has_role(v_uid, 'onboarding_staff'::app_role)
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RETURN 0;
  END IF;

  -- Only the known payload keys are read, so a client can never smuggle an
  -- actor id (created_by / resolved_by) into the row.
  WITH ins AS (
    INSERT INTO public.parser_diagnostics (
      kind, field, failure, occurrences, stop_number, headings, ordering,
      label, reference_class, load_id, load_number, document_id,
      document_label, parser_contract, created_by
    )
    SELECT
      r->>'kind',
      NULLIF(r->>'field', ''),
      NULLIF(r->>'failure', ''),
      COALESCE((r->>'occurrences')::integer, 0),
      NULLIF(r->>'stop_number', '')::integer,
      COALESCE(
        (SELECT array_agg(h) FROM jsonb_array_elements_text(
           CASE WHEN jsonb_typeof(r->'headings') = 'array' THEN r->'headings' ELSE '[]'::jsonb END
         ) AS t(h)),
        '{}'::text[]
      ),
      CASE WHEN jsonb_typeof(r->'ordering') = 'object' THEN r->'ordering' ELSE NULL END,
      NULLIF(r->>'label', ''),
      NULLIF(r->>'reference_class', ''),
      NULLIF(r->>'load_id', '')::uuid,
      NULLIF(r->>'load_number', ''),
      NULLIF(r->>'document_id', '')::uuid,
      NULLIF(r->>'document_label', ''),
      NULLIF(r->>'parser_contract', '')::integer,
      v_profile
    FROM jsonb_array_elements(p_rows) AS r
    WHERE COALESCE(r->>'kind', '') <> ''
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_count FROM ins;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.log_parser_diagnostics(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_parser_diagnostics(jsonb) TO authenticated;

-- The default ran as the caller, who has no EXECUTE. The RPC stamps it instead.
ALTER TABLE public.parser_diagnostics ALTER COLUMN created_by DROP DEFAULT;

-- The policy called it in caller context too. The RPC is the only writer now.
DROP POLICY IF EXISTS "Dispatch staff log parser diagnostics" ON public.parser_diagnostics;
REVOKE INSERT ON public.parser_diagnostics FROM authenticated;
