# Pass report — 2026-09-17 2230 UTC — the grant-parity grant, the ST26-0001 incident, and a standing rule for money probes

Immutable. Do not edit after commit.

Read first: `docs/passes/2026-09-17-2200-restrictive-money-batch.md` (sections 4
and 8) and `docs/passes/2026-09-17-2005-eld-hidden.md` (Step 5). Nothing in this
pass's brief contradicted the live system; one thing in the RECORD did, and is
corrected below.

## STEP 1 — the grant, properly

### What can be established

The harness role did **not** change between 19:08 and 22:00.

```text
$ psql -At -c "select current_user, session_user, has_function_privilege(current_user,'public.grant_parity_report()','EXECUTE')"
sandbox_exec|sandbox_exec|f
```

Both roles exist and neither is a member of the other:

```text
$ psql -At -c "select rolname from pg_roles where rolname like 'sandbox%'"
sandbox_exec
sandbox_exec_qgxpkcudwjmacrdcyvhj
```

Migration 0004, line 27, is unambiguous:

```sql
GRANT EXECUTE ON FUNCTION public.grant_parity_report() TO sandbox_exec;
```

No later migration mentions the function (`grep -rn grant_parity_report
drizzle/migrations/ | grep -v 0004` → no output). Yet the ACL immediately before
this pass read:

```text
{postgres=X/postgres,service_role=X/postgres,sandbox_exec_qgxpkcudwjmacrdcyvhj=X/postgres}
```

### What cannot be established

**Why the unquoted grant did not land, I cannot say.** The only difference in the
statement that did land is a quoted identifier. What is certain is the second half
of the question: the 2005 run cannot have executed the report successfully against
that ACL. The test calls `psql` through `execFileSync`, which throws on a non-zero
exit, so `permission denied for function grant_parity_report` makes the assertion
RED. Its quoted "Tests 3 passed (3)" therefore does not correspond to a run of
that assertion. Between "the harness role changed" and "the 2005 run did not
actually call the report", the evidence points at the second.

### Fixed

Migration `0008_grant_parity_report_execute_to_harness_role.sql` grants EXECUTE to
`"sandbox_exec"` and, explicitly, to `"sandbox_exec_qgxpkcudwjmacrdcyvhj"` — both
names the harness can connect as, each named — and re-revokes from PUBLIC, `anon`
and `authenticated`. Nothing was granted to a client role: the report reads every
public table's grants.

```text
{postgres=X/postgres,service_role=X/postgres,sandbox_exec_qgxpkcudwjmacrdcyvhj=X/postgres,sandbox_exec=X/postgres}
sandbox_exec|sandbox_exec|t
```

### Gate removed, check green

`src/test/grant-parity-live.test.ts`: the `CAN_CALL_REPORT` probe, its skip banner
and `itReport` are gone; the parity assertion is `itLive` again. If the privilege
is ever lost the file goes red instead of skipping quietly.

```text
 ✓ src/test/grant-parity-live.test.ts (3 tests) 3418ms
   ✓ grant_parity_report() exists and is readable from the catalog  1072ms
   ✓ no public table admits a role its grants do not  1129ms
   ✓ parser_diagnostics is written only through the definer RPC  1212ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
```

### Shown failing once — and a finding on the way

The sandbox role cannot create tables:

```text
ERROR:  permission denied for schema public
LINE 1: create table public.zz_parity_scratch(...
```

So the scratch table was created server-side inside a `DO` block whose final
statement raises, which rolls the whole thing back. **Attempt one found nothing.**
That was not blindness — it was correct. `pg_default_acl` for grantor `postgres`
on relations reads
`{postgres=arwdDxtm,anon=arwdDxtm,authenticated=arwdDxtm,service_role=arwdDxtm}`,
so a newly created public table already carries the grants a policy needs. With
the grant revoked after creation, attempt two:

```text
PARITY REPORT FOUND: zz_parity_scratch | authenticated | SELECT | policy "zz_scratch_read" admits authenticated for SELECT but the role holds no SELECT grant
```

Both attempts rolled back (the migration tool reports "The migration file and
journal entry were rolled back, so nothing was applied and no files remain").
Residue check:

```text
$ psql -At -c "select count(*) from pg_class where relname='zz_parity_scratch'"
0
```

`drizzle/migrations/` ends at `0008` — no scratch migration file survives.

## STEP 2 — ST26-0001

```text
 invoice_number | amount  | status | submitted_at |          updated_at           |          created_at
----------------+---------+--------+--------------+-------------------------------+-------------------------------
 ST26-0001      | 1875.00 | open   |              | 2026-09-17 21:37:10.352836+00 | 2026-09-04 16:45:10.034747+00
```

Amount reads **1875.00**. Status `open`, `submitted_at` NULL — the reason
`enforce_invoice_immutability` never bound and the 2200 probe's write was
permitted by design.

`updated_at` is **21:37:10**, which is *earlier* than the 21:45 window this pass
was asked to sweep. The window was therefore widened to `21:00:00+00` so the
restore itself could not be missed. Sweep across all 21 money tables, by
`updated_at` where the column exists and `created_at` otherwise:

```text
NOTICE:  MOVED: invoices -> 1 row(s) (col=updated_at)
NOTICE:  sweep complete
```

A second sweep by `created_at` across the same 21 tables:

```text
NOTICE:  insert sweep complete: no line above means zero rows created
```

**Nothing besides ST26-0001's `updated_at` moved, and no money row was created.**
No stop condition.

## STEP 3 — the standing rule

Recorded verbatim as section (a) of the new record entry:

> A verification probe never writes to a real money row outside a transaction
> that raises. If the psql role cannot perform the write, the probe uses a scratch
> row created and destroyed inside that transaction, or tests only a refusal that
> cannot succeed. The 2026-09-17 2200 pass changed invoice ST26-0001 to 9999
> through a real session and committed it; it was restored immediately and
> disclosed.

The two demonstrations the 2200 pass could not make are on the follow-up list as
an OPEN GAP, with the reason each could not fire:

- `enforce_remittance_immutability` — `factoring_remittances` holds zero rows, so
  there is no row to attempt to change.
- `enforce_accessorial_adjustment_immutability` — no permissive UPDATE policy
  admits any of the five identities, so an update is a silent zero-row no-op and
  the trigger is never reached.

Both triggers are enabled (`tgenabled = 'O'`); neither has been observed refusing
anything. Closing the gap needs a scratch remittance row and an adjustment UPDATE
path, both inside a transaction that raises.

## STEP 4 — record correction

Appended to the record: **the 2005 pass's claim that the grant-parity fix worked
was wrong. The check has not run since 2026-09-14 23:43 UTC.** The correct claim
would have been: *migration 0004 issued the grant, but the live ACL was not
re-read afterwards, so whether the harness can call the report is unverified.*

## STEP 5 — full suite and typecheck

```text
 Test Files  1 failed | 201 passed | 2 skipped (204)
      Tests  1 failed | 2020 passed | 16 skipped (2037)
     Errors  2 errors
   Duration  587.92s
```

The two errors are the known `[vitest-worker]: Timeout calling "onTaskUpdate"`
reporter timeouts. The one failure was psql contention, not a defect:

```text
FAIL  src/test/storage-bucket-limits.test.ts > live storage bucket size limits > every cap that exists in no migration is still in place
Error: Command failed: psql -At -c select id || '|' || coalesce(file_size_limit::text, 'null') from storage.buckets order by id
psql: error: connection to server at "aws-0-us-west-2.pooler.supabase.com" (54.70.143.232), port 6543 failed: FATAL:  (EAUTHQUERY) auth_query secret check timed out
```

Re-run alone:

```text
 ✓ src/test/storage-bucket-limits.test.ts (4 tests) 5258ms
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

Passing count moved 2019 → 2020: the gated skip is a real test again.

Typecheck `npx tsgo -p tsconfig.app.json --noEmit`: **clean**.

## Files changed

`git diff --stat` against a dirty tree returns nothing — the platform commits as
it goes, so the pass's diff is only available against the previous pass's commit
(`3a3fd3b47`). Real output:

```text
 docs/tms-build-status.md                           | 113 +++++++++++++++++++++
 docs/tms-wish-list.md                              |   4 +-
 ...grant_parity_report_execute_to_harness_role.sql |  19 ++++
 drizzle/migrations/meta/0008_snapshot.json         |  18 ++++
 drizzle/migrations/meta/_journal.json              |   7 ++
 src/test/grant-parity-live.test.ts                 |  47 +++------
 6 files changed, 172 insertions(+), 36 deletions(-)
```

This report is the seventh file and is not in that stat because it is written
last.
