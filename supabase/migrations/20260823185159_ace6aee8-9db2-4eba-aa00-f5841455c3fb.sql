ALTER FUNCTION public.file_load_references(uuid, jsonb, text, uuid, text, text)
  SET search_path TO 'public', 'extensions';
ALTER FUNCTION public.resolve_parser_diagnostic(uuid)
  SET search_path TO 'public', 'extensions';