CREATE TABLE public.binder_share_bundles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_by uuid,
  driver_name text,
  unit_number text,
  doc_tokens uuid[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

GRANT SELECT, INSERT ON public.binder_share_bundles TO authenticated;
GRANT ALL ON public.binder_share_bundles TO service_role;

ALTER TABLE public.binder_share_bundles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators can view their own bundles"
  ON public.binder_share_bundles FOR SELECT TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Authenticated users can create bundles"
  ON public.binder_share_bundles FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE OR REPLACE FUNCTION public.resolve_share_bundle(p_token uuid)
 RETURNS TABLE(share_token uuid, id uuid, name text, file_url text, expires_at date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_bundle public.binder_share_bundles%ROWTYPE;
  v_tok uuid;
BEGIN
  SELECT * INTO v_bundle FROM public.binder_share_bundles b WHERE b.token = p_token;
  IF NOT FOUND OR v_bundle.expires_at <= now() THEN
    RETURN;
  END IF;

  FOREACH v_tok IN ARRAY v_bundle.doc_tokens LOOP
    RETURN QUERY
      SELECT v_tok, r.id, r.name, r.file_url, r.expires_at
      FROM public.resolve_share_token(v_tok) r
      WHERE r.id IS NOT NULL;
  END LOOP;

  RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_share_bundle(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_share_bundle(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_share_bundle_meta(p_token uuid)
 RETURNS TABLE(driver_name text, unit_number text, doc_count int)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT b.driver_name, b.unit_number, coalesce(array_length(b.doc_tokens, 1), 0)
  FROM public.binder_share_bundles b
  WHERE b.token = p_token AND b.expires_at > now();
$function$;

REVOKE ALL ON FUNCTION public.get_share_bundle_meta(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_share_bundle_meta(uuid) TO anon, authenticated, service_role;