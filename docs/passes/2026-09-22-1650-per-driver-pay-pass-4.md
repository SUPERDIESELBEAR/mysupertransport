# Per-driver pay — Part A (P42, follow the company unless set) and PASS 4 of 5: settlement lines record the rate

2026-09-22 16:50 UTC. BUILD MODE. Read first: `docs/passes/2026-09-22-1615-per-driver-pay-pass-3.md`
("A finding, raised not smoothed over") and the design's Step 5 Pass 4. Nothing in the prompt
contradicted the live system, so nothing stopped. One migration:
`drizzle/migrations/0041_linehaul_follows_company_and_line_rate_record.sql`, applied; `types.ts`
regenerated.

## PART A — a driver follows the company linehaul rate unless the owner has set his own

### P42 (owner, 2026-09-22), recorded

> A driver follows the company linehaul rate unless the owner has deliberately set his own. The Pass 3
> backfill pinned all 157 drivers to their own 72%; those versions are closed as of 2026-09-21, so from
> 2026-09-22 they follow the company.

### The close, done deliberately and visibly

`ab_guard_operator_linehaul_pct_append_only` permits setting `effective_to` on a current version only
with `has_permission(auth.uid(), 'driver_pay.change')`. A migration holds no JWT and therefore no
permission — correct fail-closed behaviour, not a harness defect — so this was a DATA change run
through the query path, not a migration: in one transaction the guard trigger was disabled, the 157
`source='backfill'` rows had `effective_to` set to `2026-09-21`, and the trigger was re-enabled. That
is the escape 0038 set out for migrations, used once, in the open. **Nothing was deleted.**

Read back from the live table in the same statement:

```
backfill_closed: 157   still_current: 0   total_versions: 157
operators_off_72: 0    company_pct_today: 72.00
guard_enabled: O (enabled)   settlement f77911b0: 327.94/paid
```

### The mirror

`sync_operator_linehaul_pct_mirror()` (service_role only, idempotent) now follows the company too:
`operators` LEFT JOIN his version in force today, coalesced with
`company_pay_policy_on(CURRENT_DATE).linehaul_pct`. A driver with no current version shows the COMPANY
rate in `operators.pay_percentage`. A NULL company rate leaves every mirror untouched — fail closed
rather than write a guess into the figure the forecast reads. Cron `sync-operator-linehaul-pct-mirror`
runs `10 5 * * *`, so a version or a company policy that starts on a date is mirrored **during** that
date; settlements never read the mirror, only the forecast does.

### Proved, then rolled back (Marcus's session, raising transaction)

```
a) past week 2026-08-12, his closed backfill (expect 72.00): 72.00
b) his own version TODAY (expect NONE): NONE
b2) company rate TODAY (expect 72.00): 72.00
c) demo driver 82 from 2026-09-29: ACCEPTED
d) company version 65 from 2026-09-29: ACCEPTED
e) Steve (no version of his own) on 2026-09-29 (expect 65): 65
f) the driver the owner set, on 2026-09-29 (expect 82): 82.00
g) the past week after both changes (expect 72.00): 72.00
h) current versions fleet-wide (expect 1, the probe driver): 1
```

A company-wide linehaul change now reaches every driver the owner has not deliberately set, and moves
no one he has. The Pass 3 finding is closed.

## PART B — PASS 4: the settlement line records the rate

### The columns

`public.settlement_line_items` (the DRIVER settlement line table; the dispatch equivalent already had
`resolved_pct`) gained:

| Column | Meaning |
| --- | --- |
| `resolved_pct numeric(5,2)` | the percentage that produced the line, 0–100 |
| `pct_source text` | `driver_version` or `company_policy` |
| `pct_version_id uuid` | the id of the row it was read from |

All three are **NULLABLE and deliberately NOT backfilled**, stated plainly: every line written before
this pass has no rate record, and paid settlement `f77911b0` was not modified. "No record" and
"recorded as the company rate" are different facts and must stay different.

CHECKs: `pct_source IN ('driver_version','company_policy')`; `resolved_pct` between 0 and 100; and
`(resolved_pct IS NULL) = (pct_source IS NULL)` — a percentage with no stated origin, or an origin with
no percentage, is a half-record nobody could audit. No foreign key on `pct_version_id`: it names
`operator_linehaul_pct_versions` or `pay_policies` depending on the source, and neither table admits a
delete.

### The engine writes all three, on every line a percentage priced

`src/lib/settlementEngine.ts`: `SettlementLine` gained the three fields and one helper, `rateRecord()`,
is the only place that decides the origin — `driver_version` when the line's rate key is `linehaul`
AND a driver percentage was supplied, `company_policy` otherwise, carrying `policy.id`. It is applied
at all three writers: the per-load header lines (linehaul, per-ton, loadout, fuel surcharge), the
per-load charge lines, and the late-accessorial (`-A1`) adjustment lines. `headerRateLines` now returns
the rate key and percentage per line instead of dropping them.

Lines no percentage priced — fuel, deductions, cash advances, the Repair & Maintenance Deposit,
carry-forward, a reimbursement paid at cost, a Clean Roadside bonus paid at 100% — carry NULL.

`src/lib/settlementRun.ts` reads the version id as well as the percentage
(`linehaulByOperator`, new in `src/lib/operatorLinehaulPct.ts`, which now selects `id`) and persists
`resolved_pct`, `pct_source`, `pct_version_id` in the run payload; `store_settlement_run` was
re-created to insert them.

### Proved in a raising transaction

Engine-side origin logic: `src/lib/__tests__/settlementLineRateRecord.test.ts`, 9 tests. Persistence,
through the real `store_settlement_run` in Marcus's session, rolled back:

```
i)  ST-PROBE Linehaul  -> 72.00 / company_policy / is the policy id: true
i)  ST-PROBE detention -> 100.00 / company_policy / is the policy id: true
i)  ST-PROBE fuel      -> NULL  / NULL
ii) ST-PROBE Linehaul  -> 82.00 / driver_version  / is the policy id: false (his version id)
ii) ST-PROBE detention -> 100.00 / company_policy / is the policy id: true
iii) a percentage with no origin: REFUSED 23514
iv)  f77911b0 327.94/paid, its lines with a rate record: 0 (expect 0)
```

### Where a driver settlement's detail screen reads these (described, Pass 5 builds it)

The staff settlement detail already reads `settlement_line_items` for the id, line type, amount and
description; the three new columns sit on the same row, so the screen adds them to that one select and
shows, per line, "72% — company rate sheet" or "82% — his rate", linking the id to the company pay
policy version or to his dated entry. A line with no record reads "not recorded" rather than "72%".
DRIVER-FACING views are unchanged and must stay so: `src/components/operator/MySettlements/` never
selects these columns, and `src/test/operator-pay-exposure.test.ts` plus the rendered-output assertions
in `mySettlements.test.tsx` (no `%` anywhere in his screen) keep it that way.

## The suite

`bunx vitest run --maxWorkers=2`, verbatim:

```
 Test Files  3 failed | 214 passed | 2 skipped (219)
      Tests  3 failed | 2198 passed | 16 skipped (2217)
```

Two were the familiar pooler `EAUTHQUERY` timeout (`billing-schema`,
`staff-suspension-permission`; `payments-schema` hit it earlier in the same run and recovered). The
third was this pass's own guard: `sharedPayPct.test.ts` deep-equals the retained Pratt line, and that
line now carries the rate record — updated to assert `resolvedPct 72 / company_policy / the policy id`,
because a per-ton line is priced on the COMPANY column and must never name a driver version. Re-run
together: **74 passed (4 files)**. Typecheck clean.

## Files this pass authored

- `drizzle/migrations/0041_linehaul_follows_company_and_line_rate_record.sql`
- `src/integrations/supabase/types.ts` (regenerated)
- `src/lib/operatorLinehaulPct.ts` (`id` on the row, `linehaulByOperator`, `ResolvedOperatorLinehaul`)
- `src/lib/settlementEngine.ts` (`PctSource`, the three line fields, `rateRecord`, `HeaderRateLine`)
- `src/lib/settlementRun.ts` (the version id gathered and persisted)
- `src/lib/__tests__/settlementLineRateRecord.test.ts` (new)
- `src/lib/__tests__/perDriverLinehaulPct.test.ts` (the engine-input and persistence assertions)
- `src/lib/__tests__/sharedPayPct.test.ts` (the retained Pratt line now asserts its rate record)
- `docs/passes/2026-09-22-1650-per-driver-pay-pass-4.md`, `docs/tms-build-status.md`,
  `docs/tms-wish-list.md`

Deployed: database changes (migration plus the two re-created functions) and client code only — no edge
function changed. Confirmed by reading the live catalog and the live table back, not the migration text.
