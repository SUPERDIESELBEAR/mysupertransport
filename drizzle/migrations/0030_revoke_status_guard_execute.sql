-- Defect this pass introduced and fixed: 0029 created
-- public.guard_ica_status_forward_only() without revoking EXECUTE, so it was
-- reachable by anon and authenticated (src/test/definer-live-catalog.test.ts
-- caught it). Trigger functions are never called directly by a client; the same
-- three revokes as the 0027 guards.
--
-- UNDO: GRANT EXECUTE ON FUNCTION public.guard_ica_status_forward_only() TO PUBLIC;

REVOKE EXECUTE ON FUNCTION public.guard_ica_status_forward_only() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.guard_ica_status_forward_only() FROM anon;
REVOKE EXECUTE ON FUNCTION public.guard_ica_status_forward_only() FROM authenticated;
