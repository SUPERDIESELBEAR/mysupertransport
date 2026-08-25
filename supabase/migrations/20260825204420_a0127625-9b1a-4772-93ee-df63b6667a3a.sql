-- The 8-argument audit log search was left pinned to 'public' alone, which the
-- live-catalog guard flags. Re-author it with the standard pin. Body unchanged.
CREATE OR REPLACE FUNCTION public.search_audit_log(
  p_search text DEFAULT NULL::text,
  p_action text DEFAULT NULL::text,
  p_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_to timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_limit integer DEFAULT 21,
  p_offset integer DEFAULT 0,
  p_actor_id uuid DEFAULT NULL::uuid,
  p_entity_id uuid DEFAULT NULL::uuid
)
RETURNS SETOF public.audit_log
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
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
    AND (p_actor_id IS NULL OR actor_id = p_actor_id)
    AND (p_entity_id IS NULL OR entity_id = p_entity_id)
  ORDER BY created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
$function$;