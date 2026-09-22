# Per-driver pay, Pass 1 of 5 — date-test every pay-rate reader

**2026-09-22 1345–1420 UTC. BUILD MODE. Option (c), chosen by the owner.**
Design: `docs/passes/2026-09-22-1345-per-driver-pay-design.md` (Step 5, Pass 1).

**Contradiction check: no stop.** The live shape matched the design, including the two facts the
1230 report established — `pay_policies` had `effective_date` only, and the single-company-default
index still allows exactly one default row.

---

## Why this pass exists, and why it must come first

With one policy version alive, a dated reader and an undated reader are **indistinguishable**: both
return the only row there is. So nothing observable today protects these readers, and nothing would
have caught the defect until the day a second version was created — at which point it is a wrong
percentage on a settlement.

Reproduced on real data, against a throwaway second version (see Step 4):

| The read as it was | What it did with two versions |
|---|---|
| `.eq('is_company_default', true).maybeSingle()` | matched **2 rows** → PostgREST throws → the whole settlement run stops |
| a bare `.limit(1)`, no date test | an **arbitrary** version |
| `.order('effective_date', desc).limit(1)` | the **newest** version — during the probe "THROWAWAY v2", a rate dated in the **future** that had not started |

Hence the design's sequencing rule: **no second version may exist until this pass is green.**

---

## Step 1 — the effective window

Migration `0037_pay_policy_effectective_window_and_dated_resolver`:

- `effective_from date NULL`, `effective_to date NULL` on `pay_policies`.
- The one live row backfilled to `effective_from = 2000-01-01`, being
  `LEAST(effective_date 2026-08-18, earliest settlement period_start 2026-08-12, '2000-01-01')`.
  `effective_date` **untouched** — it is what the existing screens and the P35 guard read.
  `effective_to` NULL, meaning *current*.
- `pay_policies_single_company_default` deliberately **left alone**. Re-scoping it to current
  versions is Pass 2, and doing it here would allow a second version before its readers were ready.

Semantics, stated once and honoured identically in both resolvers: **`effective_from` NULL = open
start** (covers every earlier date); **`effective_to` NULL = the current version**.

---

## Step 2 — one resolver, two statements of it, eleven readers routed

The window is stated exactly twice, because the database needs it for its SECURITY DEFINER functions
and the app needs it for its queries:

- `public.company_pay_policy_on(_as_of date)` — `SETOF pay_policies`, SECURITY INVOKER, STABLE,
  `search_path` pinned to `public, extensions`, EXECUTE to `service_role` only. Zero rows when no
  version is in force, rather than a NULL row.
- `src/lib/payPolicyVersion.ts` — `companyPolicyVersionQuery(sb, asOf)` returns the builder so each
  call site keeps its own error handling, and `fetchCompanyPolicyVersion(sb, asOf)` for callers with
  none. Neither defaults the date: **which date to ask about is the caller's business.**

| # | Reader | Before | After |
|---|---|---|---|
| 1 | `settlementRun.ts:187` company default | `.eq('is_company_default', true).maybeSingle()` | `companyPolicyVersionQuery(sb, period.periodStart)` — the **work week** |
| 2 | `settlementRun.ts:188-190` policy assignments | already dated by work period | unchanged |
| 3 | `dispatchSettlementRun.ts:111` | `.eq('is_company_default', true).maybeSingle()` | `companyPolicyVersionQuery<PayPolicyRates>(sb, monthStart)` — the **month** |
| 4 | `payTreatment.fetchEffectivePayPolicy` | `.eq(...).eq('is_active', true).order('effective_date', desc).limit(1).maybeSingle()` | `fetchCompanyPolicyVersion(supabase, todayAsOf())` |
| 5 | `LoadChargesCard` | via #4 | via #4 |
| 6 | `RevisedRateConModal` | via #4 | via #4 |
| 7 | `FuelDiscountPassthroughSettings` load | `.eq('is_company_default', true).maybeSingle()` | `companyPolicyVersionQuery(supabase, todayAsOf())` |
| 8 | `FuelDiscountPassthroughSettings` write (`:117`) | updates the row in place | **unchanged — P40/P41.** Only *which row* it is given changed |
| 9 | `discountPassthrough.ts` | `.eq('is_company_default', true).maybeSingle()` | `fetchCompanyPolicyVersion(supabase, todayAsOf())` |
| 10 | `my_fuel_transactions` (definer) | inline default lookup | `company_pay_policy_on(today, carrier zone)` |
| 11 | `driver_load_pay_estimate`, `create_accessorial_adjustment` (definers) | inline default lookup | same, each re-created from its own `pg_get_functiondef` with only the lookup substituted |

The earnings forecast reads `operators.pay_percentage` and was not touched; it becomes Pass 3 work.

---

## Step 3 — proof nothing moved

Identical before and after:

| Figure | Value |
|---|---|
| Settlement `f77911b0-50cd-4ae3-bff2-ebb0bc4331af` | **paid, gross 327.94, net 327.94**, 1 line, period_start 2026-08-12 |
| Dispatch charge verdicts (stored `resolved_pct`) | detention **100**, lumper **100**, tonu **72** |
| Steve Figueroa (operator `2c24ca65-5933-431e-b6af-a3b8085ee109`, user `878be880-…`) | `pay_percentage` **72**, active |
| All driver records | **157 of 157 at 72**, none null, none other |
| The one policy version | SUPERTRANSPORT Standard, linehaul **72.00**, `effective_date` 2026-08-18, `effective_from` 2000-01-01, `effective_to` NULL |

---

## Step 4 — proof the readers are ready for version two

Inside a block that **raised** (nothing committed): v1 closed at 2026-09-29, a throwaway v2 at 82%
opened from 2026-09-30. The single-default index had to be dropped **inside that block** to insert a
second default at all — stated plainly because it is the constraint Pass 2 re-scopes. The tenancy
trigger also had to be given a server-side caller (`set_config(..., local = true)`), since it refuses
to default a row to a carrier.

```
RESOLVER, per date (v1 = 72 to 2026-09-29, v2 = 82 from 2026-09-30):
  2026-08-12 -> SUPERTRANSPORT Standard (linehaul 72.00)
  2026-09-22 -> SUPERTRANSPORT Standard (linehaul 72.00)
  2026-09-29 -> SUPERTRANSPORT Standard (linehaul 72.00)
  2026-09-30 -> THROWAWAY v2 (linehaul 82)
  2026-12-01 -> THROWAWAY v2 (linehaul 82)
CLIENT-RESOLVER WINDOW, rows matched per date (must be exactly 1):
  2026-08-12 -> 1 row(s)   2026-09-22 -> 1 row(s)   2026-09-30 -> 1 row(s)
OLD undated .maybeSingle() matches 2 rows (>1 = the run ERRORS)
OLD newest-by-effective_date screens would show: THROWAWAY v2 (a rate that has NOT started)
DEFINERS today -> SUPERTRANSPORT Standard (linehaul 72.00)
```

After rollback: **1** policy row, **1** default, the index present, `effective_from 2000-01-01`,
`effective_to` NULL.

---

## What the pass exposed in the test doubles

Four fake query builders had no `.or()` and failed loudly the moment a reader used one — the honest
outcome, and how the blast radius was measured. Fixed in
`settlementRun.test.ts`, `dispatchSettlementRun.test.ts`, `settlement-adjustment-seam.test.ts`, and
`src/test/helpers/pgFake.ts`, where `.or()` is **implemented** rather than stubbed: a stub returning
every row would let a **closed** version answer for a date it no longer governs while the test still
passed, which is the exact defect the dated reader exists to prevent. It **throws** on an operator it
does not support, so no future caller gets a false green out of it.

The PostgREST embed guard rejected a caller-supplied column list (`.select(columns)` is not
statically resolvable), so the resolver selects the whole row with a literal argument. A pay policy is
one narrow row; there was nothing to save by trimming it.

New guard, `src/test/pay-policy-dated-readers.test.ts`: no module but the resolver may filter
`pay_policies` on `is_company_default`; the resolver must state **both** halves of the window plus
`is_active`, and must `.limit(1)` before `.maybeSingle()`; the two settlement runs must resolve
against their own period and never `todayAsOf()`.

---

## Verification

- **Full suite, `--maxWorkers=2`**, verbatim:
  `Test Files  1 failed | 214 passed | 2 skipped (217)`
  `Tests  1 failed | 2175 passed | 16 skipped (2192)`
  `Duration  649.62s`
  The one failure was `archived-applicants.test.ts` losing its pooler connection
  (`psql: FATAL: (EAUTHQUERY) auth_query secret check timed out`) — infrastructure, not this pass.
  Re-run alone: **16 passed**.
- **Typecheck:** clean (`tsgo --noEmit`).
- **Deployment:** no edge function changed, so nothing was deployed. The migration was applied by the
  migration tool and confirmed by reading the live column values and the resolver's own output above;
  the app changes are client code and reach the preview through the normal build.
- **Step 5 skipped and said so:** the pass ran 13:45–14:20 UTC, **before 15:05**, so today's
  idle-operator job had not run. `operator_idle` notifications created today: **0**, as expected
  before the job rather than as evidence about it.

---

## Files this pass authored

- `drizzle/migrations/0037_pay_policy_effectective_window_and_dated_resolver.sql` *(applied earlier in the pass)*
- `src/lib/payPolicyVersion.ts` *(new)*
- `src/test/pay-policy-dated-readers.test.ts` *(new)*
- `src/lib/settlementRun.ts`, `src/lib/dispatchSettlementRun.ts`, `src/lib/payTreatment.ts`,
  `src/lib/fuel/discountPassthrough.ts`, `src/components/management/FuelDiscountPassthroughSettings.tsx`
- `src/test/helpers/pgFake.ts`, `src/lib/__tests__/settlementRun.test.ts`,
  `src/lib/__tests__/dispatchSettlementRun.test.ts`, `src/test/settlement-adjustment-seam.test.ts`
- `src/integrations/supabase/types.ts` *(regenerated)*
- `docs/tms-build-status.md`, `docs/tms-wish-list.md`,
  `docs/passes/2026-09-22-1345-per-driver-pay-design.md` *(gate-lifted note)*, this report

---

## Pass 2, next

Version the company policy properly: re-scope `pay_policies_single_company_default` to **current**
versions only (as P34 did for dispatch settlements), add the append-only guard so a policy row is
never edited in place, and allow closing `effective_to` only with `pay_policy.change`. The gate is
lifted: a second version may now be created.
