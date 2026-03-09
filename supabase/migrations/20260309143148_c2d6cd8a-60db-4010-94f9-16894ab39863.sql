
CREATE OR REPLACE FUNCTION public.search_audit_log(
  p_search  text    DEFAULT NULL,
  p_action  text    DEFAULT NULL,
  p_from    timestamptz DEFAULT NULL,
  p_to      timestamptz DEFAULT NULL,
  p_limit   int     DEFAULT 21,
  p_offset  int     DEFAULT 0
)
RETURNS SETOF public.audit_log
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.audit_log
  WHERE
    has_role(auth.uid(), 'management'::app_role)
    AND (
      p_search IS NULL OR p_search = ''
      OR actor_name    ILIKE '%' || p_search || '%'
      OR entity_label  ILIKE '%' || p_search || '%'
      OR entity_type   ILIKE '%' || p_search || '%'
      OR action        ILIKE '%' || p_search || '%'
      OR metadata::text ILIKE '%' || p_search || '%'
    )
    AND (p_action IS NULL OR p_action = '' OR action = p_action)
    AND (p_from   IS NULL OR created_at >= p_from)
    AND (p_to     IS NULL OR created_at <= p_to)
  ORDER BY created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
$$;
