-- Public PEI submissions are handled exclusively by the SECURITY DEFINER
-- function public.submit_pei_response which validates the response_token.
-- The permissive anon INSERT policies on pei_responses/pei_accidents bypass
-- token validation and are therefore removed.

DROP POLICY IF EXISTS "Public submit PEI response via token" ON public.pei_responses;
DROP POLICY IF EXISTS "Public submit PEI accidents via response" ON public.pei_accidents;