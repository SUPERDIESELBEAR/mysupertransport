CREATE TABLE public.ica_review_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  recipient_name text NOT NULL,
  recipient_email text NOT NULL,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  opened_at timestamptz,
  revoked boolean NOT NULL DEFAULT false
);

CREATE INDEX idx_ica_review_links_created_at ON public.ica_review_links (created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.ica_review_links TO authenticated;
GRANT ALL ON public.ica_review_links TO service_role;

ALTER TABLE public.ica_review_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view ICA review links"
  ON public.ica_review_links FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can create ICA review links"
  ON public.ica_review_links FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Creator or management can revoke ICA review links"
  ON public.ica_review_links FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'management'::app_role)
    OR public.has_role(auth.uid(), 'owner'::app_role)
  )
  WITH CHECK (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'management'::app_role)
    OR public.has_role(auth.uid(), 'owner'::app_role)
  );

CREATE OR REPLACE FUNCTION public.get_ica_review_link(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.ica_review_links%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.ica_review_links WHERE token = _token;
  IF NOT FOUND OR v_row.revoked OR v_row.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  IF v_row.opened_at IS NULL THEN
    UPDATE public.ica_review_links SET opened_at = now() WHERE id = v_row.id;
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'recipient_name', v_row.recipient_name,
    'note', v_row.note,
    'expires_at', v_row.expires_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ica_review_link(text) TO anon, authenticated, service_role;