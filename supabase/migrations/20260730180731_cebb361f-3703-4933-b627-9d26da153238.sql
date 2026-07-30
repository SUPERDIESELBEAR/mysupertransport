-- =====================================================================
-- STANDING RULE (project convention, enforced by test + README):
--   Every SECURITY DEFINER function in schema public MUST declare
--     SET search_path = public, extensions
--   and MUST schema-qualify every extension call, e.g.
--     extensions.gen_random_bytes(...), extensions.digest(...)
--   A definer function pinned to `search_path = public` alone cannot
--   see pgcrypto and fails at runtime the first time it is called.
--   (This is exactly how get_or_create_short_link shipped broken.)
-- =====================================================================

-- 1. Stop future tables/sequences from inheriting anon privileges.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;

-- 2. Strip the inherited blanket privileges from every existing table.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- 3. Re-grant only what an anon policy actually allows.
--    `applications` has one anon policy: INSERT (public job application).
--    No other table in public has a policy naming the anon role, and no
--    anonymous code path reads a table directly -- every signed-out flow
--    (/inspect, /s, /pei/respond, /pei/release, /passenger-auth,
--     /application/approve, /apply, /preview-login) goes through a
--    SECURITY DEFINER RPC or an edge function.
--    `faq` is therefore deliberately NOT granted: it has no anon policy,
--    so a grant would be inert and misleading.
GRANT INSERT ON public.applications TO anon;

COMMENT ON SCHEMA public IS
  'anon holds no table privileges here except INSERT on applications. Signed-out access goes through SECURITY DEFINER RPCs. Definer functions must SET search_path = public, extensions and schema-qualify extension calls.';