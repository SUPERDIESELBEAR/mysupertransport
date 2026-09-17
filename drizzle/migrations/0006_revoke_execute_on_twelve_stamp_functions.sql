-- Migration 0005 created four stamp trigger functions and did NOT revoke
-- EXECUTE from the client roles, so `anon` and `authenticated` could call
-- them directly. Trigger functions are never called by a client; the live
-- SECURITY DEFINER catalog guard and the fuel anon-reachability guard both
-- caught this. Revoke explicitly, PUBLIC included, so no future default
-- grant re-widens them.

REVOKE ALL ON FUNCTION public.stamp_company_from_user_ref() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stamp_company_from_fuel_batch() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stamp_company_from_fuel_transaction() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stamp_company_from_osas_sheet() FROM PUBLIC, anon, authenticated;
