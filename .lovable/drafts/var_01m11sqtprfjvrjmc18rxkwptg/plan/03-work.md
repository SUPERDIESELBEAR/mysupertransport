## The one change to make

A documentation record only, in `docs/tms-build-status.md` alongside the issue-1 entry:

- Issue 2 is **stale — no current emitter**. `grant_parity_report()` returns zero rows; `authenticated` already holds SELECT/INSERT/UPDATE/DELETE on both `loads` and `user_roles`; the reported 2026-08-24 13:24–13:25 cluster has aged out of a log window that now retains roughly nine minutes.
- The proposed fix — `GRANT EXECUTE ON FUNCTION current_profile_id TO authenticated` — would have **reversed a revoke made deliberately on 2026-08-20 and reaffirmed in migration 20260824134718**. Acting on it would have reopened a closed security decision in order to make a stale symptom disappear.
- `grant_parity_report()` is the authority for this class of question, and it confirmed the grants were already correct. **No new guard is needed** — `grant-parity-live.test.ts` already calls it on every DB-attached run.
- The single `permission denied for function grant_parity_report` is expected: EXECUTE is `service_role` only, so any call made as `authenticated` produces it.

No migration, no grant, no schema change, no test change, no application change.
