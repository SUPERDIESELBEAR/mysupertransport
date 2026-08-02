-- Four SECURITY DEFINER functions shipped in recent migrations without an
-- explicit REVOKE, so they inherited the default EXECUTE grant to PUBLIC.
-- Three are trigger functions, which no client should ever be able to call
-- directly; the fourth is an internal helper invoked via PERFORM from inside
-- other definer functions, where it runs as the owner and needs no grant.
-- Caught by definer-live-catalog.test.ts.

REVOKE ALL ON FUNCTION public.enforce_rods_correction_request_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_rods_correction_request_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_rods_correction_request() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_notification_delivery_failure(text, text, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;

-- get_eld_escalation_ledger(uuid) is deliberately left executable by
-- `authenticated`: the management console reads it via supabase.rpc, and the
-- body gates every row on public.is_staff(auth.uid()). It is NOT granted to
-- anon.
REVOKE ALL ON FUNCTION public.get_eld_escalation_ledger(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_eld_escalation_ledger(uuid) TO authenticated;