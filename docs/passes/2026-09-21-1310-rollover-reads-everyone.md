# 2026-09-21 13:10 UTC — rollover-dispatch-status reads every driver (BUILT, TESTED, **NOT DEPLOYED**)

Read first: `docs/passes/2026-09-21-1135-scheduled-jobs-verified.md`, Step 2 on jobs 9
and 10. Nothing in the prompt contradicted the live system. One live figure has moved
since the 1135 pass and is corrected below.

## STEP 1 — the fix

New database function, migration `drizzle/migrations/0014_latest_dispatch_log_per_operator.sql`:

```sql
CREATE OR REPLACE FUNCTION public.latest_dispatch_log_per_operator(p_today date)
RETURNS TABLE (operator_id uuid, status public.daily_dispatch_status,
               log_date date, created_at timestamptz)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT DISTINCT ON (l.operator_id) l.operator_id, l.status, l.log_date, l.created_at
  FROM public.dispatch_daily_log l
  JOIN public.operators o ON o.id = l.operator_id
  WHERE l.log_date <= p_today
    AND COALESCE(o.excluded_from_dispatch, false) = false
    AND COALESCE(o.is_parked, false) = false
  ORDER BY l.operator_id, l.log_date DESC, l.created_at DESC
$$;
```

SECURITY INVOKER (no RLS bypassed, nothing to register in the definer inventories),
STABLE, `search_path` pinned. `REVOKE ALL` from PUBLIC, `anon` and `authenticated`;
`GRANT EXECUTE` to `service_role` only — the edge function is its sole caller. Undo is a
comment in the migration (`DROP FUNCTION public.latest_dispatch_log_per_operator(date)`).

`supabase/functions/rollover-dispatch-status/index.ts`: the direct
`.from('dispatch_daily_log')…lte('log_date', today)` read and the JS reduction are
replaced by `supabase.rpc('latest_dispatch_log_per_operator', { p_today: today })`. The
result is one row per operator, so no row cap can ever truncate it. **Not** fixed by
raising the limit or paging, as instructed: the table grows daily and a bigger cap only
moves the cliff (a test arm pins that).

Rules the function applies — every one kept exactly as it was:

1. `log_date <= today` (today in `America/Chicago`, `todayInChicago()` unchanged) — moved
   into the SQL function as `p_today`.
2. `excluded_from_dispatch = true` → skipped — moved into the SQL function.
3. `is_parked = true` → skipped, never carried forward — moved into the SQL function.
4. Latest log row per operator wins, by `log_date DESC, created_at DESC` — now
   `DISTINCT ON`.
5. If `active_dispatch.dispatch_status` already equals the log status → counted `skipped`,
   no write. Unchanged, in the edge function.
6. Otherwise upsert `active_dispatch` on `operator_id` with `updated_by: null`, then
   insert a `dispatch_status_history` row noted "Daily rollover from calendar"; a failed
   history insert is non-fatal. Unchanged.
7. Auth gate (`x-cron-secret` matching `CRON_SECRET`, or a service-role bearer), CORS,
   and the `{today, checked, promoted, skipped, errors}` response shape. Unchanged.

No other file, table, policy or job touched.

## STEP 2 — it reads everyone

`dispatch_daily_log` now holds **6,039** rows (`select count(*) from dispatch_daily_log`) —
up from 6,021 at 11:35.

**Old read**, newest-first capped at PostgREST's default 1,000:

```sql
with newest as (
  select l.operator_id from dispatch_daily_log l join operators o on o.id = l.operator_id
  where l.log_date <= (now() at time zone 'America/Chicago')::date
  order by l.log_date desc, l.created_at desc limit 1000)
select count(distinct operator_id) from newest;   -- 41
```

**New read**, the shape the function now uses:

```sql
select count(*) from (
  select distinct on (l.operator_id) l.operator_id
  from dispatch_daily_log l join operators o on o.id = l.operator_id
  where l.log_date <= (now() at time zone 'America/Chicago')::date
    and coalesce(o.excluded_from_dispatch,false) = false
    and coalesce(o.is_parked,false) = false
  order by l.operator_id, l.log_date desc, l.created_at desc) x;   -- 45
```

**41 against 45.** The 1135 report measured **34**; today's fresh logs pulled four more
operators inside the newest 1,000, which is exactly the point — the old read's coverage
is an accident of how recently each driver was logged, and it shrinks as the table grows.
The four drivers it gained today it will lose again. The new read is 45 because there are
45 eligible operators, and that is the only number it can ever be.

## STEP 3 — the dry run (nothing written)

The decision logic run against today's data. 45 eligible, 37 already matching, **8 would
change** — the same eight named in the 1135 report, no difference.

| Driver | Latest log | Log says | Board says | Board would get | Flags |
| --- | --- | --- | --- | --- | --- |
| Christopher Hickman | 2026-06-05 | truck_down | not_dispatched | **truck_down** | inactive; log >30d |
| Johnathan McMillan | 2026-06-10 | home | not_dispatched | **home** | inactive; log >30d |
| Tyler Walls | 2026-06-11 | home | not_dispatched | **home** | inactive; log >30d |
| Gehazi Irwin | 2026-06-11 | home | not_dispatched | **home** | inactive; log >30d |
| Edward Williams | 2026-06-11 | home | not_dispatched | **home** | inactive; log >30d |
| Jocquan Scott | 2026-06-13 | home | not_dispatched | **home** | inactive; log >30d |
| David Wambolt | 2026-06-17 | dispatched | not_dispatched | **dispatched** | inactive; log >30d |
| Hafeezullah Awal Khan | 2026-08-18 | truck_down | not_dispatched | **truck_down** | inactive; **deactivated**; log >30d |

The other 37 are "no change" (log status already equals board status). Three of those are
also inactive with stale logs (Makiethian James 2026-05-20, Taji Jackson 2026-05-27,
James Onan 2026-06-04, all `truck_down` both sides) — they need no write.

**Worth the owner's eye, and NOT changed here.** All eight are `operators.is_active =
false`, and Hafeezullah Awal Khan additionally has `deactivated_at` set. The function has
never had an `is_active` filter, and the instruction was to keep every existing rule
exactly as it is, so the fix keeps it. The consequence is plain: deployed as written, the
next run would write June and August statuses onto the board for eight drivers who are no
longer active — `dispatched` for David Wambolt on the strength of a 17 June entry. Adding
an `is_active` rule, or an age cutoff, is a product decision and belongs to whoever
reviews this table.

Query behind the table: the Step 2 `distinct on` read joined to `operators`,
`applications` (for names) and `active_dispatch` (for the current board status).

## STEP 4 — NOT DEPLOYED

**The deployed `rollover-dispatch-status` is untouched.** No `supabase--deploy_edge_functions`
call was made in this pass; the live function is still the old, capped one, and tonight's
05:05 and 06:05 runs will behave exactly as they did today (checked 41-ish, promoted 0).
The database function *is* applied — migrations apply on write and nothing calls it yet,
so it is inert.

One instruction deploys it: **"deploy rollover-dispatch-status."**

## STEP 5 — tests

`src/test/rollover-reads-everyone.test.ts`, 8 tests, two arms:

- **Source guard** — the edge function must call `latest_dispatch_log_per_operator` and
  must not read `dispatch_daily_log` directly, must not use `.range(` or a three-digit-plus
  `.limit(`, and must still name both eligibility rules. `ROLLOVER_SOURCE` points it at
  another file.
- **Semantics** — 1,209 log rows across 40 operators, one of them last logged in June:
  the capped client-side reduction returns fewer than 40 and never sees the stale
  operator; the `DISTINCT ON` reduction returns exactly 40, the latest row each, stale one
  included; and a cap raised to 1,100 still misses him.

Failing against the old read first, `ROLLOVER_SOURCE=/tmp/rollover-old/index.ts`:

```
 FAIL  src/test/rollover-reads-everyone.test.ts > rollover-dispatch-status source guard >
        reduces the daily log in the database instead of reading the table directly
AssertionError: expected '    const { data: logs, error: logsEr…' to contain 'rpc(\'latest_dispatch_log_per_operato…'
 Test Files  1 failed (1)
      Tests  1 failed | 7 passed (8)
```

Against the new source:

```
 ✓ src/test/rollover-reads-everyone.test.ts (8 tests) 12ms
 Test Files  1 passed (1)
      Tests  8 passed (8)
```

## Full suite — `--maxWorkers=4`, verbatim

```
 Test Files  4 failed | 200 passed | 2 skipped (206)
      Tests  4 failed | 2029 passed | 16 skipped (2049)
     Errors  2 errors
   Duration  408.24s
```

All four failures, and both unhandled errors, are the sandbox pooler, not the code. Each
failure is the same `psql: FATAL: (EAUTHQUERY) auth_query secret check timed out` against
`aws-0-us-west-2.pooler.supabase.com:6543`, and the two errors are Vitest
`Timeout calling "onTaskUpdate"` worker-RPC timeouts. Re-run serially, all pass:

```
 Test Files  1 failed | 4 passed (5)       (fuel-import-live, same pooler timeout)
      Tests  1 failed | 68 passed (69)
```
then that file alone:
```
 Test Files  1 passed (1)
      Tests  18 passed (18)
```

So the real result is **2,049 checks with no product failure**; the skips are the two
named gated suites. Typecheck (`tsgo --noEmit`): clean, no output.

## Files this pass authored

- `drizzle/migrations/0014_latest_dispatch_log_per_operator.sql` (new)
- `supabase/functions/rollover-dispatch-status/index.ts` (read replaced; nothing else)
- `src/test/rollover-reads-everyone.test.ts` (new)
- `src/integrations/supabase/types.ts` (regenerated by the migration)
- `docs/passes/2026-09-21-1310-rollover-reads-everyone.md` (this report)
- `docs/tms-build-status.md`, `docs/tms-wish-list.md` (dated entries)
