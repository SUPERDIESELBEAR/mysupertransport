CREATE OR REPLACE FUNCTION public.update_pei_archive_category(
  _application_id uuid,
  _archive_category text,
  _note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _name text;
  _old text;
  _label text;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _archive_category IS NULL OR _archive_category NOT IN ('hired','not_hired') THEN
    RAISE EXCEPTION 'Archive category must be hired or not_hired';
  END IF;
  IF _note IS NOT NULL AND length(_note) > 500 THEN
    RAISE EXCEPTION 'Note is too long';
  END IF;

  SELECT a.pei_archive_category,
         btrim(coalesce(a.first_name,'') || ' ' || coalesce(a.last_name,''))
    INTO _old, _label
  FROM public.applications a WHERE a.id = _application_id;

  IF _old IS NULL THEN
    RAISE EXCEPTION 'Applicant is not archived';
  END IF;

  SELECT btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,''))
    INTO _name FROM public.profiles p WHERE p.id = auth.uid();

  UPDATE public.applications
  SET pei_archive_category = _archive_category,
      pei_archived_by = auth.uid(),
      pei_archived_by_name = nullif(_name,''),
      pei_archive_reason = CASE
        WHEN _note IS NOT NULL AND btrim(_note) <> ''
        THEN coalesce(pei_archive_reason,'') || E'\n[' || to_char(now(),'YYYY-MM-DD') || ' ' || coalesce(nullif(_name,''),'Staff') || '] Category changed to ' || _archive_category || ': ' || btrim(_note)
        ELSE pei_archive_reason END
  WHERE id = _application_id;

  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (auth.uid(), nullif(_name,''), 'pei_archive_category_changed', 'application', _application_id, nullif(_label,''),
          jsonb_build_object('from', _old, 'to', _archive_category, 'note', nullif(btrim(coalesce(_note,'')),'')));
END;
$$;

REVOKE ALL ON FUNCTION public.update_pei_archive_category(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_pei_archive_category(uuid, text, text) TO authenticated;