# Issue 2 — stale, no current emitter

Investigation is complete. No code, schema, grant, or test change is warranted. The only remaining action is a documentation record.

## What the evidence shows

**1. `public.grant_parity_report()` output, verbatim:**

```text
 table_name | role_name | command | issue | detail
------------+-----------+---------+-------+--------
(0 rows)
```

**2. Parity on `loads` and `user_roles`:** zero rows means no policy on either table admits a role its table privileges do not back, and no direction of mismatch exists. Confirmed directly:

```text
loads|authenticated|SELECT INSERT UPDATE DELETE = true true true true
user_roles|authenticated|SELECT INSERT UPDATE DELETE = true true true true
loads|anon / user_roles|anon = false false false false   (no anon policy exists on either)
```

All four `loads` policies and all three `user_roles` policies resolve through `has_role()`, and `has_function_privilege('authenticated','public.has_role(uuid,app_role)','EXECUTE')` is `true`. Nothing in those policy bodies calls `current_profile_id()`.

**3. Recurrence since migration 20260824134718 (2026-08-24 13:47):** none — but the retained window does not reach back that far. `postgres_logs` currently holds **26 rows spanning 2026-08-27 18:01 to 18:10 UTC** (about nine minutes). A `%permission denied%` filter over `postgres_logs` and over edge logs both return zero rows. So: no occurrence of "permission denied for table loads", "…for table user_roles", or "…for function grant_parity_report" exists in retained logs, and the 2026-08-24 cluster has aged out of retention entirely.

**4. GRANT-level vs RLS:** correct — `permission denied for table X` is raised before policy evaluation; an RLS denial returns zero rows. The evidence is **not** consistent with a missing table grant today: `authenticated` holds full SELECT/INSERT/UPDATE/DELETE on both tables. Nor is it a caller-evaluated-function failure: the only function in those policy bodies is `has_role`, which `authenticated` can execute, and no column default on either table calls a revoked helper. The errors have no live source.

**5. `permission denied for function grant_parity_report` (x1):** the expected explanation. `EXECUTE` is `true` only for `service_role`; `anon` and `authenticated` are both `false`. Any call made as `authenticated` — a client or a tool session, rather than psql/service_role — produces exactly that single error. Nothing else needs to be posited.

**6. `current_profile_id` posture:** unchanged and correct.

```text
current_profile_id|secdef=t|search_path=public, extensions
stamp_load_stop_time_source|secdef=t|search_path=public, extensions
grant_parity_report|secdef=t|search_path=public, extensions
EXECUTE on current_profile_id: anon=false authenticated=false service_role=true
```

It is `SECURITY DEFINER` with a pinned `search_path`. No RLS policy and no column default on `loads` or `user_roles` reaches it from an invoker context, so the revoke does not bite on either reported path. `stamp_load_stop_time_source` calls it from a definer trigger with the same pin and works.
