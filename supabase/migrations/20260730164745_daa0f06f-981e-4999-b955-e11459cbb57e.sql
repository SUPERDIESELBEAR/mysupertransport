REVOKE ALL ON public.share_tokens FROM anon;
REVOKE ALL ON public.share_token_access_log FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.share_token_access_log FROM authenticated;
REVOKE DELETE ON public.share_tokens FROM authenticated;