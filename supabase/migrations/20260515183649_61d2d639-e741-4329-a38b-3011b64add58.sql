CREATE OR REPLACE FUNCTION public._gen_correction_token()
RETURNS text LANGUAGE sql VOLATILE SET search_path = public, extensions AS $$
  SELECT replace(replace(replace(encode(extensions.gen_random_bytes(32), 'base64'), '+','-'), '/','_'), '=','');
$$;