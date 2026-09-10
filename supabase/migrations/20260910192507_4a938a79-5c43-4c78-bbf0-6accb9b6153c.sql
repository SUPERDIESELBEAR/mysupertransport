-- 1. Grant hygiene: the anon uploader needs EXECUTE; PUBLIC never did.
--    Two storage.objects RLS policies call this function ("Applicants upload
--    docs under their own draft token", "Applicants upload signatures under
--    their own draft token"), so the anon grant is load-bearing and stays.
REVOKE EXECUTE ON FUNCTION public.is_valid_application_draft_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_valid_application_draft_token(text) TO anon, authenticated, service_role;

-- 2. Uncalled: no trigger, policy, default, view, cron, other function body
--    (prosrc scanned across every schema) and no repository caller. The product
--    calls list_driver_contacts(uuid), defined in the same migration, which
--    re-implements the same eligibility rules independently.
DROP FUNCTION IF EXISTS public.can_driver_message_staff(uuid, uuid);