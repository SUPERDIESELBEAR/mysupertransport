-- Verification of the new per-token throttle wrote 60 synthetic access rows
-- against a real, non-expiring binder token. The throttle worked (the 61st
-- open returned nothing and was logged as 'throttled') — which means that
-- token, printed on a sticker in a truck, is now rate-limited for the rest of
-- the hour. Remove the probe rows so a real scan is not the casualty of the
-- test. Marked with a hash_version no production path ever writes.
DELETE FROM public.share_token_access_log WHERE hash_version = 'test_throttle_probe';