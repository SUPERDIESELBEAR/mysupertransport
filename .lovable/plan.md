# Read-only investigation report: `get_user_roles(uuid)`

## Conclusion

**Recommendation: DROP.** The function has no current caller in any searched category. Its original purpose is fully served today by direct, RLS-scoped `user_roles` reads for the signed-in user, direct service-role table reads in backend functions, and `has_role(uuid, app_role)` for database authorization. It is not anonymous-executable, so this is not an active anonymous-data incident. It is still unnecessary authenticated cross-user surface: any signed-in caller may supply an arbitrary user UUID and receive that user’s role array because the function is `SECURITY DEFINER` and has no self/staff check.

## 1. What it is

### Live

- **Signature:** `public.get_user_roles(uuid)`; argument `_user_id uuid`; result `app_role[]`.
- **Body:** `SELECT ARRAY_AGG(role) FROM public.user_roles WHERE user_id = _user_id`.
- **Behavior:** returns every `user_roles.role` for the supplied user as an array. When no rows match, `ARRAY_AGG` returns `NULL`, not an empty array.
- **Checks:** it checks only `user_id = _user_id`. It does **not** check `auth.uid()`, caller role, account status, or whether the requested UUID belongs to the caller.
- **Execution:** `authenticated` and `service_role` may execute it. `anon` and implicit `PUBLIC` may not.
- **Comment:** no `COMMENT ON FUNCTION` exists.

### Repo

- **Defining migrations:** exactly one migration defines the function: `20260307040223_48a3c504-85c4-409a-bd88-5f3aafd3f4d4.sql`. It is therefore also the newest definition.
- **Grant-only migration:** `20260903193033_8674aee3-0e36-434b-b576-311b1da87ad5.sql` does not redefine it; it revokes `PUBLIC, anon` and grants `authenticated, service_role`.
- **Original purpose:** the creating migration labels it “Function to get all roles for a user,” adjacent to the first `user_roles` table and `has_role` helper. No more specific purpose is documented.

### Its four catalog protections — and their limit

1. **Live:** `SECURITY DEFINER` permits reading through `user_roles` RLS.
2. **Live:** `STABLE` declares it read-only within a statement.
3. **Live/repo:** it pins `search_path = public`.
4. **Live:** execution is limited to `authenticated` and `service_role`; `PUBLIC` and `anon` are revoked.

These are execution properties, not caller authorization. The function has no in-body self/staff gate. Its `public`-only search path is also the documented legacy pin, not the current `public, extensions` convention; it remains on the legacy allowlist.

## 2. Whether anything calls it — all eight categories

1. **Repo literals in `src/` and `supabase/functions/`, including dynamic and ternary RPC names — REPO: nothing found.** The only non-migration mention is a backtick comment in `supabase/functions/_shared/email/auth.ts` describing an old broken call shape. It is not executable code. No quoted literal, direct RPC, dynamic name, ternary name, or wrapper call exists.
2. **RLS policies in every schema — LIVE: nothing found.** No `qual` or `with_check` in `pg_policies` contains `get_user_roles`.
3. **Function bodies in every schema — LIVE: nothing found.** No other `pg_proc.prosrc` contains `get_user_roles`.
4. **Views and materialized views — LIVE: nothing found.** No definition contains the function name.
5. **Column defaults — LIVE: nothing found.** No default expression contains the function name.
6. **Cron — LIVE: nothing found.** The cron schema was readable and zero job commands contain the function name.
7. **Grants — LIVE/REPO: grants found, but no caller.** Current ACL grants execution to `authenticated` and `service_role`. The September 3 migration explicitly revoked `PUBLIC, anon` and re-granted those two roles.
8. **Creating migration — REPO: definition only; no call found.** The March migration creates it and documents only the generic purpose above.

**Additional category:** triggers — LIVE: nothing found.

## 3. How roles are actually read today

### Signed-in app and role switcher

- **Repo:** `useAuth.fetchRoles` reads `user_roles` directly with `.select('role').eq('user_id', userId)`.
- **Live:** `user_roles` RLS permits users to select their own rows; management and owner may select all rows.
- **Repo:** `useAuth` turns those rows into the `roles` array, chooses the default active role, restores a saved role only if it remains in that array, and exposes `setActiveRole`.
- **Repo:** `StaffLayout` renders `roles.map(...)` in the role switcher. Selecting one calls `setActiveRole`; it does not call `get_user_roles`.

### Database authorization

- **Live:** `has_role(uuid, app_role)` directly checks `public.user_roles` under `SECURITY DEFINER`.
- **Live:** the catalog currently contains 202 RLS policy expressions and 65 other function bodies referencing `has_role`. Those are the database authorization mechanism; none delegates to `get_user_roles`.

### Backend functions and staff listings

- **Repo:** backend functions query `user_roles` directly with the service-role client. The shared `requireStaff` helper explicitly says it always queries `user_roles` directly because JWT role metadata is generally absent.
- **Repo:** `get-staff-list` reads role rows directly and assembles each staff member’s roles. Other backend functions likewise read `user_roles` directly for authorization or recipient selection.

### Superseding mechanisms

The old array-returning helper is superseded by three purpose-specific paths:

1. self-scoped direct table read in `useAuth` for the current user and role switcher;
2. `has_role` for policy/function authorization;
3. service-role direct table reads for trusted backend workflows and staff listings.

These paths serve its purpose without requiring a general authenticated RPC that accepts another user’s UUID.

## 4. Anonymous execution

### Live

- `has_function_privilege('anon', ..., 'EXECUTE')` is **false**.
- The ACL contains `postgres`, `authenticated`, `service_role`, and the test harness role; it contains no `anon` or `PUBLIC` execute grant.
- An anonymous caller receives a permission error and gets no role data.

### Repo and recorded audit

- It **was one of the class-(c) functions handled by the September 3 audit**, not missed.
- The migration explicitly includes `REVOKE EXECUTE ON FUNCTION public.get_user_roles(uuid) FROM PUBLIC, anon;` and then grants only `authenticated, service_role`.

### Remaining exposure

This is not the same anonymous exposure shape as the dropped PEI helper. It is nevertheless broader than the replacement paths: because the function accepts any UUID, lacks an in-body authorization check, runs as definer, and is executable by `authenticated`, any signed-in user can ask for an arbitrary user’s roles. The direct `useAuth` table read cannot do that for ordinary users because RLS limits it to their own rows.

## 5. Recommendation and urgency

**DROP `public.get_user_roles(uuid)`.**

- **Repo/live:** nothing calls it across all eight required categories plus triggers.
- **Repo/live:** every current role-reading need has a named replacement: `useAuth` plus `user_roles` RLS, `has_role`, direct backend table reads, and `get-staff-list` for staff-directory aggregation.
- **Live:** dropping it removes an authenticated cross-user metadata reader and the final reachability finding.
- **Repo:** the historical comment about a broken invocation is evidence of a former caller, not a current dependency.

**Priority:** security hygiene above ordinary housekeeping, but below an active anonymous leak. Anonymous access was correctly removed on September 3. The remaining risk requires a valid signed-in account and reveals role membership rather than applicant or financial data.

## Contradictions

**None found.** The current record says `get_user_roles` is the final uninvestigated reachability finding and that the September 3 audit revoked its anonymous access; both match the live catalog and repository evidence.
