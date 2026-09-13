CREATE OR REPLACE FUNCTION public.scratch_failopen_probe(_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT CASE WHEN public.is_staff(auth.uid())
              THEN (SELECT count(*)::integer FROM public.inspection_cycles WHERE id = _id)
              ELSE 0
         END
$$;

CREATE OR REPLACE FUNCTION public.scratch_failopen_write_probe(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  UPDATE public.inspection_cycles
     SET grace_reason = CASE WHEN public.is_staff(auth.uid()) THEN 'ok' ELSE NULL END
   WHERE id = _id;
END;
$$;
