ALTER TABLE public.loads
  ADD COLUMN IF NOT EXISTS verbatim_verification jsonb;

COMMENT ON COLUMN public.loads.verbatim_verification IS
  'Per-field verdicts for the verbatim captures on this load: verdict, similarity, token presence, region damage, any transcription damage found in the capture itself, and whether the value was hand-repaired. Written by set_load_verbatim_verification on the same save that stores the captures.';

CREATE OR REPLACE FUNCTION public.set_load_verbatim_verification(
  p_load_id uuid,
  p_records jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
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

  UPDATE public.loads
     SET verbatim_verification = jsonb_build_object(
           'checked_at', now(),
           'checked_by', v_uid,
           'fields', COALESCE(p_records, '[]'::jsonb)
         ),
         updated_at = now(),
         updated_by = v_uid
   WHERE id = p_load_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'load not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_load_verbatim_verification(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_load_verbatim_verification(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_load_verbatim_verification(uuid, jsonb) TO service_role;