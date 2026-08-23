CREATE TABLE public.parser_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('anchor_miss','reference_label_unrecognized','reference_row_dropped')),
  field text,
  failure text,
  occurrences integer NOT NULL DEFAULT 0,
  stop_number integer,
  headings text[] NOT NULL DEFAULT '{}',
  ordering jsonb,
  label text,
  reference_class text,
  load_id uuid REFERENCES public.loads(id) ON DELETE SET NULL,
  load_number text,
  document_id uuid REFERENCES public.load_documents(id) ON DELETE SET NULL,
  document_label text,
  parser_contract integer,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid()
);

CREATE INDEX parser_diagnostics_kind_created_idx ON public.parser_diagnostics (kind, created_at DESC);
CREATE INDEX parser_diagnostics_open_idx ON public.parser_diagnostics (created_at DESC) WHERE resolved_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.parser_diagnostics TO authenticated;
GRANT ALL ON public.parser_diagnostics TO service_role;

ALTER TABLE public.parser_diagnostics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dispatch staff read parser diagnostics"
  ON public.parser_diagnostics FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'dispatcher')
    OR public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'onboarding_staff')
  );

CREATE POLICY "Dispatch staff log parser diagnostics"
  ON public.parser_diagnostics FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      public.has_role(auth.uid(), 'dispatcher')
      OR public.has_role(auth.uid(), 'management')
      OR public.has_role(auth.uid(), 'owner')
      OR public.has_role(auth.uid(), 'onboarding_staff')
    )
  );

CREATE POLICY "Dispatch staff resolve parser diagnostics"
  ON public.parser_diagnostics FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'dispatcher')
    OR public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'dispatcher')
    OR public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
  );

-- A hand-repaired capture has to say who repaired it and when. The client cannot
-- be trusted for either, so the server stamps them onto manual_repair records.
CREATE OR REPLACE FUNCTION public.set_load_verbatim_verification(p_load_id uuid, p_records jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
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

  IF p_records IS NOT NULL AND jsonb_typeof(p_records) <> 'array' THEN
    RAISE EXCEPTION 'verbatim verification must be an array of field records';
  END IF;

  SELECT COALESCE(jsonb_agg(
           CASE
             WHEN rec->>'source' = 'manual_repair' AND (rec->>'repaired_at') IS NULL
               THEN rec || jsonb_build_object('repaired_at', now(), 'repaired_by', v_uid)
             ELSE rec
           END
         ), '[]'::jsonb)
    INTO v_records
    FROM jsonb_array_elements(COALESCE(p_records, '[]'::jsonb)) AS rec;

  UPDATE public.loads
     SET verbatim_verification = jsonb_build_object(
           'checked_at', now(),
           'checked_by', v_uid,
           'fields', COALESCE(v_records, '[]'::jsonb)
         ),
         updated_at = now(),
         updated_by = v_uid
   WHERE id = p_load_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'load not found';
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.set_load_verbatim_verification(uuid, jsonb) FROM anon;