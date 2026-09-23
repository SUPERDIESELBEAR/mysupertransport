-- Pass 3a follow-up: the child stamping trigger function is SECURITY DEFINER and
-- must be reachable only by the trigger owner, exactly like stamp_tenant_company_id.
REVOKE EXECUTE ON FUNCTION public.stamp_child_company_from_parent() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.stamp_child_company_from_parent() FROM anon;
REVOKE EXECUTE ON FUNCTION public.stamp_child_company_from_parent() FROM authenticated;