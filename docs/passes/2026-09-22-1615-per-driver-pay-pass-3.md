# Per-driver pay — PASS 3 of 5: each driver's linehaul percentage, versioned, and settlements paying from it

2026-09-22 16:15 UTC. BUILD MODE. Option (c), design doc
`docs/passes/2026-09-22-1345-per-driver-pay-design.md`, Step 5 Pass 3. Nothing in the prompt
contradicted the live system, so nothing stopped.

## Step 1 — the table

`drizzle/migrations/0040_operator_linehaul_pct_versions.sql`, applied; `types.ts` regenerated.

`public.operator_linehaul_pct_versions`: `company_id` (FK `carrier_profile`, ON DELETE RESTRICT),
`operator_id` (FK `operators`, ON DELETE CASCADE), `pct numeric(5,2)` CHECK 0–100,
`effective_from date NOT NULL`, `effective_to date`, `reason text NOT NULL` CHECK `btrim <> ''`,
`actor` (FK `profiles`, ON DELETE SET NULL — a PROFILE id via `current_profile_id()`, per 0039, not
`auth.uid()`), `source` CHECK IN (`driver_page`, `agreement`, `backfill`), `created_at`, `updated_at`.

RLS: `Management reads driver linehaul versions` (has_role management OR owner) — a driver never sees
a percentage; `tenant_isolation` RESTRICTIVE FOR ALL. Unique index
`operator_linehaul_pct_single_current` WHERE `effective_to IS NULL` — one current version per driver.
Lookup index `(operator_id, effective_from DESC)`. Triggers: `aa_stamp_tenant_company_id`,
`update_operator_linehaul_pct_updated_at`, `ab_guard_operator_linehaul_pct_append_only` — `pct` and
`effective_from` frozen, only `effective_to` on the current version may be set, DELETE refused for
everyone including the owner.

## Step 2 — the backfill

One version per driver, `pct` = his `operators.pay_percentage`, `effective_from 2000-01-01`,
`source backfill`. Verified live: **157 versions, 157 current, all 72.00, 0 mismatched against
`operators.pay_percentage`**.

The backfill INSERT runs BEFORE the stamp trigger is created and names each driver's own `company_id`
explicitly. The stamp resolves the caller's `company_members` row, and a migration has no JWT, so it
resolves NULL and a NOT NULL column would refuse the insert. That is correct fail-closed behaviour,
not a harness defect.

## Step 3 — one owner-only writer

`set_operator_linehaul_pct(_operator_id, _pct, _effective_from, _reason, _source DEFAULT
'driver_page')`. SECURITY DEFINER, pinned search_path, authenticated EXECUTE; the gate is in-body and
first: `has_permission(auth.uid(), 'driver_pay.change')`, which has no role grants, so it is
owner-only. A reason is required. Back-dating is refused, so a past week can never be re-rated.
It closes the current version at `_effective_from - 1` and inserts the new one in one statement,
because `operator_linehaul_pct_single_current` would otherwise leave the driver with no current rate
between two statements.

The mirror: `operators.pay_percentage` is written in the same statement ONLY when the new version
starts today or earlier. A future-dated change leaves it alone, and
`sync_operator_linehaul_pct_mirror()` (service_role only, idempotent) catches it up on the start date
— cron job `sync-operator-linehaul-pct-mirror`, schedule `10 5 * * *`. The mirror exists because the
forecast reads `operators.pay_percentage`; settlements never do.

## Step 4 — settlements pay from it (P38)

`src/lib/operatorLinehaulPct.ts`: `operatorLinehaulVersionsQuery(sb, asOf)` returns the builder so
each call site keeps its own error handling; `linehaulPctByOperator(rows)` (later `effective_from`
wins); `resolveLinehaulPct(operatorPct, companyPolicy)`; `policyWithOperatorLinehaul(policy, pct)`.
`withLinehaulPct` was added to `src/lib/payTreatment.ts` — the one module allowed to name a
percentage column, so the shared-source guard is satisfied rather than exempted.

Every place linehaul is resolved, and what it does now:

| Place | Now |
| --- | --- |
| `settlementEngine.ts` per-load rate lines | policy passed through `policyWithOperatorLinehaul` |
| `settlementEngine.ts` late-accessorial adjustments | same, so an `-A1` uses his rate too |
| `settlementRun.ts` gathering | `operatorLinehaulVersionsQuery(sb, period.periodStart)` — the WEEK, never today |
| `driverLoadPay.ts` / the driver estimate | unchanged: `pctForClassification`, which reads the policy it is handed |
| `dispatchSettlementRun.ts` | unchanged — the dispatch settlement is not driver pay |

Only `linehaul_pct` is replaced. Detention, FSC, TONU, lumper, stop-off, per-ton and loadout still
come from the company version, so a company-wide change to any of them still reaches every driver.
A per-ton load reads `per_ton_pct`, so a hopper week is untouched by his linehaul version — asserted.

## Step 5 — nothing moved

One pay policy version, company linehaul 72.00; **157** driver versions, all 72.00, 157 current;
settlement `f77911b0-50cd-4ae3-bff2-ebb0bc4331af` still `paid`, gross 327.94, net 327.94; dispatch
rates detention 100, lumper 100, tonu 72; **0** of 157 operators off 72, so no forecast figure moved.
The fixture suites the design names are green (123 tests across `settlementRun`, `settlementEngine`,
`sharedPayPct`, `sharedPayPctCallers`, the source guard and `operator-pay-exposure`).

## Step 6 — proven, then rolled back

One transaction, real sessions, raised at the end. Subject: the sandbox driver
`1fd52882-08a2-48e0-b08a-c24eb9beab21`.

```
a) Marcus 82% from 2026-09-23: ACCEPTED
b) in force TODAY (expect 72): 72.00
c) in force NEXT WED (expect 82): 82.00
d) in force for the PAST week 2026-08-12 (expect 72): 72.00
e) mirror operators.pay_percentage, future start so expect 72: 72
e2) versions for him now: 2
f) Mae: REFUSED 42501
g) Leo: REFUSED 42501
h) no reason: REFUSED 22004
i) back-dated: REFUSED 22007
j) Marcus deletes a version: REFUSED 42501
k) pct edited in place: REFUSED 42501
l) second CURRENT version: REFUSED 23505
m) company version opened at 65%: ACCEPTED
n) HIS rate on next Wed, unmoved by the company change (expect 82): 82.00
o) company rate on next Wed (expect 65): 65; Steve's own version row: 72.00
```

### A finding, raised not smoothed over

The prompt asked to prove that a company policy change "DOES reach a driver still at the company
rate". After Step 2's backfill there is no such driver: every one of the 157 has a version of his own,
so verdict (o) shows the company moving to 65% while Steve stays on his own 72%. That is what option
(c) with a per-driver backfill means, and it is a decision, not a defect — the alternative is to
backfill no one and let a NULL mean "follow the company". Only the LINEHAUL column behaves this way;
every other rate still follows the company version company-wide. Put to the owner; unchanged pending
his answer.

## Step 7 — the screens still owed

Pass 5 must deliver BOTH:

1. the **Linehaul Pay card** on the staff driver page, with the dated change form, calling
   `set_operator_linehaul_pct`;
2. a **company pay policy screen** calling `open_pay_policy_version`, which still has no caller.

Both `AWAITING` allowlist entries in `src/test/function-reachability.test.ts` come off in that pass
(`KNOWN_NO_CALLER_MAX` back down by two).

## Files this pass authored

- `drizzle/migrations/0040_operator_linehaul_pct_versions.sql`
- `src/integrations/supabase/types.ts` (regenerated)
- `src/lib/operatorLinehaulPct.ts`
- `src/lib/payTreatment.ts` (`withLinehaulPct`)
- `src/lib/settlementEngine.ts` (`operatorLinehaulPct` input, two policy resolutions)
- `src/lib/settlementRun.ts` (the dated gather, the per-operator map, the engine input)
- `src/lib/__tests__/perDriverLinehaulPct.test.ts`
- `src/test/definer-live-catalog.test.ts` (new definer registered, ceiling 138 -> 139)
- `src/test/function-reachability.test.ts` (`AWAITING` entry, ceiling 3 -> 4)
- `src/test/tenancy-resolver.test.ts` (stamped census + `RESTRICTIVE_DONE`)
- `docs/passes/2026-09-22-1615-per-driver-pay-pass-3.md`, `docs/tms-build-status.md`,
  `docs/tms-wish-list.md`

Confirmed from the live catalog, not from the migration text: the table's columns, both indexes, all
three triggers, both function signatures and the cron schedule were read back from the database.
