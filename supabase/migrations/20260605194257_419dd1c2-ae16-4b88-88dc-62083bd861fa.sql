CREATE OR REPLACE FUNCTION public.check_application_email_taken(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.applications
    WHERE lower(email) = lower(coalesce(p_email, ''))
      AND is_draft IS NOT TRUE
  );
$$;

REVOKE ALL ON FUNCTION public.check_application_email_taken(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_application_email_taken(text) TO anon, authenticated, service_role;
