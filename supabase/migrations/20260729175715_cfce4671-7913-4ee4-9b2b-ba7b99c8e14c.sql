ALTER VIEW public.v_compliance_items SET (security_invoker = on);

DROP POLICY IF EXISTS "Anyone can resolve short links" ON public.document_short_links;
REVOKE SELECT ON public.document_short_links FROM anon;

CREATE OR REPLACE FUNCTION public.resolve_short_link(_code text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT share_token FROM public.document_short_links WHERE code = _code LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_short_link(text) TO anon, authenticated;