CREATE OR REPLACE FUNCTION public.archive_applicant_pei(
  _application_id uuid,
  _reason text,
  _archive_category text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _name text;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _archive_category IS NULL OR _archive_category NOT IN ('hired', 'not_hired') THEN
    RAISE EXCEPTION 'Archive category must be hired or not_hired';
  END IF;
  IF _archive_category = 'not_hired' AND (_reason IS NULL OR length(btrim(_reason)) = 0) THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;
  IF _reason IS NOT NULL AND length(btrim(_reason)) > 500 THEN
    RAISE EXCEPTION 'Reason is too long';
  END IF;

  SELECT btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,''))
    INTO _name FROM public.profiles p WHERE p.id = auth.uid();

  UPDATE public.applications
  SET pei_archived_at = now(),
      pei_archived_by = auth.uid(),
      pei_archived_by_name = nullif(_name, ''),
      pei_archive_reason = CASE WHEN _archive_category = 'hired' THEN null ELSE btrim(_reason) END,
      pei_archive_category = _archive_category
  WHERE id = _application_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_applicant_pei(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_applicant_pei(uuid, text, text) TO service_role;