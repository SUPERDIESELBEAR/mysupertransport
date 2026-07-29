
CREATE TABLE public.document_short_links (
  code text PRIMARY KEY,
  share_token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT ON public.document_short_links TO anon, authenticated;
GRANT ALL ON public.document_short_links TO service_role;

ALTER TABLE public.document_short_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can resolve short links"
  ON public.document_short_links
  FOR SELECT
  USING (true);

CREATE OR REPLACE FUNCTION public.get_or_create_short_link(_share_token text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_existing text;
  v_attempt int := 0;
BEGIN
  IF _share_token IS NULL OR length(_share_token) < 8 THEN
    RAISE EXCEPTION 'invalid share token';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT code INTO v_existing
  FROM public.document_short_links
  WHERE share_token = _share_token;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_code := lower(substring(encode(gen_random_bytes(8), 'hex') from 1 for 8));
    BEGIN
      INSERT INTO public.document_short_links (code, share_token, created_by)
      VALUES (v_code, _share_token, auth.uid());
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt > 5 THEN
        RAISE;
      END IF;
    END;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_short_link(text) TO authenticated;
