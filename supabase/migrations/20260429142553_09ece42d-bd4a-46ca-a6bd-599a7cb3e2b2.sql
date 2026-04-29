
ALTER TABLE public.operators
  ADD COLUMN IF NOT EXISTS last_web_seen_at timestamptz;

CREATE OR REPLACE FUNCTION public.mark_operator_seen(_standalone boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _op_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO _op_id
  FROM public.operators
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF _op_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.operators
  SET
    last_web_seen_at = now(),
    pwa_installed_at = CASE
      WHEN _standalone AND pwa_installed_at IS NULL THEN now()
      ELSE pwa_installed_at
    END
  WHERE id = _op_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_operator_seen(boolean) TO authenticated;
