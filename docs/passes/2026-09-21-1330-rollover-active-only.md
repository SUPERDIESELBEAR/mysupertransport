# 2026-09-21 13:30 UTC — rollover rolls forward ACTIVE drivers only (DEPLOYED)

Read first: `docs/passes/2026-09-21-1310-rollover-reads-everyone.md`. Owner decision
(2026-09-21): the rollover must never write a status onto the board for a driver who is
not active. Nothing in the prompt contradicted the live system. **One figure in the prompt
does not match the record and is corrected in Step 3: the active eligible count is 34, not
37.** 37 was the count of drivers already matching in the 1310 dry run (45 eligible, 37
matching, 8 changing); 11 of those 45 are inactive, so the active eligible set is 34.

## STEP 1 — which version was live: the OLD capped code

Established without triggering the job, by three readings:

1. `supabase--edge_function_logs('rollover-dispatch-status')` — **no logs at all**; the
   retention window holds nothing for this function, so the version could not be read
   from a boot line.
2. `net._http_response` — the oldest surviving row is `2026-09-21 07:26 UTC`
   (`select min(created) from net._http_response`, 366 rows). The 05:05 and 06:05 rollover
   responses have **aged out**; their bodies cannot be read. (The `%checked%` rows still
   alive are the hourly PEI job, `checked:19`.)
3. Behavioural proof, which settles it: the new code would have promoted the eight drifted
   drivers at 05:05 and written eight `dispatch_status_history` rows noted "Daily rollover
   from calendar". `select operator_id, dispatch_status, changed_at, status_notes from
   dispatch_status_history order by changed_at desc limit 8` shows **no rollover row at
   all**; the only two changes today (12:19 and 12:23 UTC) have empty `status_notes`,
   i.e. staff edits. Before those, the newest history rows are from 2026-09-20 01:16. The
   eight drifted drivers were still drifted at the start of this pass
   (`would_change_all = 8`, query in Step 3).

So the deployed function was the old, capped code, exactly as the 1310 pass recorded. The
new code was **not** already live.

## STEP 2 — the rule

Migration `drizzle/migrations/0015_rollover_active_operators_only.sql` replaces
`public.latest_dispatch_log_per_operator(date)` with two rules added and every other rule
byte-identical:

```sql
    AND COALESCE(o.excluded_from_dispatch, false) = false  -- administrative hide
    AND COALESCE(o.is_parked, false) = false               -- parked: never rolled forward
    AND o.is_active = true                                 -- owner decision 2026-09-21
    AND o.deactivated_at IS NULL                           -- owner decision 2026-09-21
```

Unchanged: `log_date <= p_today`, `DISTINCT ON (l.operator_id) ORDER BY l.operator_id,
l.log_date DESC, l.created_at DESC`, SECURITY INVOKER, `STABLE`, `search_path` pinned,
`REVOKE ALL` from PUBLIC / `anon` / `authenticated`, `GRANT EXECUTE` to `service_role`
only. The `COMMENT` now names the active-driver rule. The undo is a comment at the foot of
the migration: it restores the 0014 definition verbatim, without the two new lines.

The edge function's rule comment gained the same two lines; no logic in it changed.

Live definition verified after apply with `pg_get_functiondef` — quoted in the pass log,
both new lines present.

## STEP 3 — the dry run (nothing written)

```sql
with latest as (
  select distinct on (l.operator_id) l.operator_id, l.status, l.log_date
  from dispatch_daily_log l join operators o on o.id = l.operator_id
  where l.log_date <= (now() at time zone 'America/Chicago')::date
    and coalesce(o.excluded_from_dispatch,false) = false
    and coalesce(o.is_parked,false) = false
    and o.is_active = true and o.deactivated_at is null
  order by l.operator_id, l.log_date desc, l.created_at desc)
select count(*) as eligible,
  count(*) filter (where ad.dispatch_status::text = latest.status::text) as no_change,
  count(*) filter (where ad.dispatch_status is null
                      or ad.dispatch_status::text <> latest.status::text) as would_change,
  count(*) filter (where latest.log_date < current_date - 30) as stale_over_30d
from latest left join active_dispatch ad on ad.operator_id = latest.operator_id;
```

| eligible | no_change | would_change | stale_over_30d |
| --- | --- | --- | --- |
| 34 | 34 | **0** | 0 |

**Zero drivers would change**, and the table of drivers the next run would change is
empty — there is no row to list. Every one of the 34 active eligible drivers already has a
board status equal to their latest log, and not one of their latest logs is older than 30
days.

The same query without the two new rules still returns `eligible = 45,
would_change = 8` — the eight inactive drivers of the 1310 report. They are now outside
the eligibility set, so no June or August status can reach the board. Hafeezullah Awal
Khan is excluded twice over (`is_active = false` and `deactivated_at` set).

## STEP 4 — DEPLOYED

`supabase--deploy_edge_functions(['rollover-dispatch-status'])` → "Successfully deployed
edge functions: rollover-dispatch-status".

Confirmed without running the write path: an unauthenticated `POST` to
`/rollover-dispatch-status` with no `x-cron-secret` and no service bearer returned
**403 `{"error":"Forbidden"}`**. That request is refused by the auth gate at the top of the
handler, before the RPC read and before any upsert, so the deployed bundle is live and
serving and nothing was written. The limit of that means is stated plainly: a 403 is
identical in both versions, so *which* version is live rests on the deploy tool's own
confirmation plus the file on disk; the 403 proves only that the deployed function boots
and gates. (`OPTIONS` was attempted first and the curl tool rejects that method.)

## STEP 5 — TOMORROW'S PROOF, OWED

Owed and unpaid: the **05:05 UTC** run on 2026-09-22 must respond with
`checked` = the active eligible count (34 today, whatever `is_active AND deactivated_at IS
NULL` yields then) and `promoted = 0`. It must be read from `net._http_response` **before
~11:00 UTC** — retention is about six hours and the 05:05 body is gone by midday, which is
exactly why this pass could not read today's. If it is missed, the 06:05 run is a second
chance on the same clock, and `dispatch_status_history` rows noted "Daily rollover from
calendar" are the durable fallback: there should be none.

## STEP 6 — tests

`src/test/rollover-reads-everyone.test.ts` is now **12 tests**. Added:

- source guard: the edge function must name `is_active` and `deactivated_at`.
- a new arm, *rollover promotes active drivers only*: three operators — one active
  (`home`, logged 2026-09-20), one inactive and one `deactivated_at`-set (both logged
  **2026-09-21**, newer than the active one), all three sitting at `not_dispatched` on the
  board. Without the rule, both the inactive and the deactivated driver are promoted (the
  defect). With it, neither is, and the active driver still is.

Failing without the rule (rule disabled in a scratch copy of the file):

```
 ✓ WITHOUT the rule, an inactive driver with a newer log IS promoted — the defect
 × WITH the rule, neither the inactive nor the deactivated driver is promoted
 × and the active driver is still promoted
AssertionError: expected [ 'active-1', 'deactivated-1', …(1) ] to not include 'inactive-1'
AssertionError: expected [ 'active-1', 'deactivated-1', …(1) ] to deeply equal [ 'active-1' ]
 Test Files  1 failed (1)
      Tests  2 failed | 10 passed (12)
```

With the rule:

```
 ✓ src/test/rollover-reads-everyone.test.ts (12 tests) 17ms
 Test Files  1 passed (1)
      Tests  12 passed (12)
```

## Full suite — `--maxWorkers=4`, verbatim

```
 Test Files  4 failed | 200 passed | 2 skipped (206)
      Tests  4 failed | 2033 passed | 16 skipped (2053)
     Errors  2 errors
```

Three of the four failures and all the unhandled errors are the sandbox pooler, not the
code: each is `psql: FATAL: (EAUTHQUERY) auth_query secret check timed out` against
`aws-0-us-west-2.pooler.supabase.com:6543`, and the errors are Vitest
`Timeout calling "onTaskUpdate"` worker-RPC timeouts. Re-run at `--maxWorkers=1`, three of
the four pass: `Test Files 1 failed | 3 passed (4)`, `Tests 1 failed | 86 passed (87)`.

The fourth is a real, **pre-existing** environment failure with nothing to do with this
pass, reported and not worked around: `src/test/grant-parity-live.test.ts` now gets
`ERROR: permission denied for function grant_parity_report`. The sandbox role renamed
itself — `select current_user` is now `sandbox_exec`, while
`pg_proc.proacl` for `grant_parity_report` reads
`{postgres=X/postgres,service_role=X/postgres,sandbox_exec_qgxpkcudwjmacrdcyvhj=X/postgres}`,
the grant migration 0008 handed to the old harness role name. The parity report itself is
unchanged; only the harness identity moved. No grant was added to paper over it — that is
the owner's call and it is on the wish list.

An earlier `--maxWorkers=4` run of the same tree read
`Test Files 2 failed | 202 passed | 2 skipped (206)`,
`Tests 2 failed | 2035 passed | 16 skipped (2053)`, `Errors 3 errors` — the same pooler
flakiness, differently distributed. Typecheck (`tsgo --noEmit`): clean, no output.

## Files this pass authored

- `drizzle/migrations/0015_rollover_active_operators_only.sql` (new)
- `supabase/functions/rollover-dispatch-status/index.ts` (rule comment only; deployed)
- `src/test/rollover-reads-everyone.test.ts` (extended, 8 → 12 tests)
- `src/integrations/supabase/types.ts` (regenerated by the migration)
- `docs/passes/2026-09-21-1330-rollover-active-only.md` (this report)
- `docs/tms-build-status.md`, `docs/tms-wish-list.md` (dated entries)
