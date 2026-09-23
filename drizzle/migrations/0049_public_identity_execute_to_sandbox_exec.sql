-- The psql test harness connects as sandbox_exec (see 0047). It must be able to
-- read the two public identity functions to assert what they return, and only
-- that: PUBLIC, anon beyond the intended grant, and authenticated are untouched
-- here, and PUBLIC stays revoked.
GRANT EXECUTE ON FUNCTION public.carrier_public_identity(text) TO sandbox_exec;
GRANT EXECUTE ON FUNCTION public.carrier_identity_for_draft(text) TO sandbox_exec;