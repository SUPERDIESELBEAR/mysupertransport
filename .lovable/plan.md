## 0. Raise the log-retention question with the platform — before the migration

This goes first, because a "yes" changes what the evidence file concludes.

**The ask, precisely:** `log_statement = ddl` is on (from the configuration file), so the `GRANT` or `CREATE FUNCTION` that widened `anon` EXECUTE on the four pgmq wrappers **was written to the Postgres log**. The queryable `postgres_logs` window is roughly ten minutes. The question for Lovable/Supabase:

- Are raw Postgres log archives retained anywhere beyond the queryable window — cold storage, object-storage export, platform-side backups of the log stream?
- Can a longer window be provided on request for a specific date range on this project?
- If archives exist, the target is any `GRANT ... ON FUNCTION public.{enqueue_email, delete_email, read_email_batch, move_to_dlq}` or `CREATE OR REPLACE FUNCTION` on those four names, any time after `20260428151032_email_infra.sql` was applied.

I will raise this through the available support/platform channel and, because I cannot guarantee a same-turn answer, the evidence file gets a dated **Outstanding** entry recording that the request was made, when, and what was asked. When the answer arrives it replaces that entry:

- **No archives** → "cannot be established" becomes final, and the file says so as a settled conclusion rather than an unfinished search.
- **Archives exist** → the window can be dated precisely, and that is a materially different fact for anyone advising on disclosure. I will retrieve the range and amend the file.

The migration does not wait on the answer — it overwrites `proacl`, not the logs, so the archive question stays answerable afterwards.

## 1. The evidence file: `docs/eld-mail-queue-acl-2026-08-01.md`

Written before the migration. Contents as previously agreed — verbatim `pg_get_functiondef`, `proacl`, and `proconfig` for all four; the queue inventory (all eight tables at 0 rows) with the payload shape and the note that auth-queue bodies carry live magic-link, recovery, and invite URLs; the four dead ends on dating; the two unrecorded hand-named migration files (`20260421111515_realtime_equipment_assignments.sql`, `20260710210000_rename_stage9_payroll_procedures.sql`) with the finding that the 326/324 gap is benign bookkeeping, not missing history.

Plus a section that stands on its own, not filed under this incident:

> ## Standing finding: privilege changes on this database are not investigable after the fact
>
> `log_statement = ddl` is enabled, so security-relevant DDL — `GRANT`, `REVOKE`, `CREATE`/`ALTER`/`DROP FUNCTION`, role changes — **is captured**. The queryable retention window for `postgres_logs` is approximately **ten minutes**; an explicit 90-day query returns 2,790 rows spanning about nine. `edge_logs` behaves the same way (44 rows, ~8 minutes).
>
> The failure is not capture. It is **retention**. Every privilege change on this database is logged and then discarded within roughly ten minutes, which means no such change can be attributed, dated, or reconstructed once that window passes.
>
> This is a standing condition affecting every future question of this kind, not a detail of the pgmq incident. It is the direct reason a real question — when did `anon` EXECUTE appear on four functions holding rendered auth emails — could not be answered. Extending or exporting Postgres log retention is the single highest-value control available here: it costs no write overhead, the data is already being produced, and it would have made this investigation a lookup rather than four dead ends.
>
> Ranked against the alternative: log retention first, `track_commit_timestamp` second. The latter requires a `postmaster`-context restart, dates only catalog-row modification, and did not survive the catalog-wide freeze that flattened `xmin` here. Take both if available; take retention regardless.

## 2. The migration

Seven repins: `purge_rods_day(uuid, text)`, `purge_rods_day(uuid, text, text)`, `record_rods_purge_storage_result(uuid, text[], jsonb, boolean)` → `SET search_path = public, extensions`; `enqueue_email`, `delete_email`, `read_email_batch`, `move_to_dlq` → `SET search_path = public, pgmq, extensions`. Bodies byte-identical to current `pg_get_functiondef`.

Grants on the four: `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated;` then `GRANT EXECUTE ... TO service_role;` — both roles named explicitly, since `REVOKE FROM PUBLIC` will not clear explicit entries.

Header comment records: the prior revoke in `20260428151032_email_infra.sql` and the out-of-band re-widening with external provisioning as the cause; that `track_commit_timestamp` is off and why the date could not be established, with all four dead ends named so nobody repeats them; the retention gap as the underlying reason; a pointer to the evidence file; and the instruction that a third recurrence means checking whether email infrastructure was re-provisioned, with `definer-live-catalog.test.ts` as the standing guard because no file-based check can see this.

Verification after apply: re-query `proacl` for the four and `proconfig` for all seven.

## 3. Then, as approved

Shared resolver `src/test/helpers/migrationFunctions.ts` (signature-keyed, `DROP FUNCTION` handling, last-definition-wins); both file guards converted to it; `CUTOFF` constants removed; allowlist with the three assertions and migration-filename anchoring; `definer-live-catalog.test.ts` reading `pg_proc` with a loud skip when no DB is reachable, carrying the standing `anon` EXECUTE assertion — group 1 (~45 trigger functions) revoked, group 2 (~14 tokenized public endpoints) allowlisted, group 3 (~50) seeded into the dated shrink-only backlog untouched.

## Order

1. Raise the log-archive request with the platform; record it as Outstanding in the evidence file.
2. Write `docs/eld-mail-queue-acl-2026-08-01.md`, including the standing retention finding.
3. Migration: seven repins, four grant corrections, header comment.
4. Re-query `proconfig` and `proacl`; confirm.
5. Shared resolver; convert both guards; enforced allowlist; remove `CUTOFF`.
6. Live-catalog test with the `anon` assertion; groups 1 and 2 resolved, group 3 seeded.
7. Run the suite; report green/red, allowlist contents, `LEGACY_MAX`, and the platform's answer on log archives when it lands.
