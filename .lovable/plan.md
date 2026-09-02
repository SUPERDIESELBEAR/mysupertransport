# Dispatch company settlement — design proposal

Design only. No code, no migrations. Every schema claim below comes from a live
catalog query, named inline. Function bodies were read from `pg_get_functiondef`
in the live catalog after listing every migration that defines them
(`store_settlement_run`: 2 migrations, newest `20260901113705`;
`enforce_settlement_immutability`: 2, newest `20260901113215`).

Queries used: (Q1) `information_schema.columns` for `settlements`,
`settlement_line_items`, `settlement_withheld_loads`, `settlement_settings`,
`settlement_settings_history`, `pay_policies`, `load_charges`; (Q2)
`pg_constraint` + `pg_get_constraintdef` for those tables and `loads`; (Q3)
`pg_policies` for the four settlement tables; (Q4) `pg_proc` (`prosecdef`,
`proconfig`, `has_function_privilege`, `pg_get_functiondef`).

## 1. Tables

**`dispatch_settlements`** — one row per calendar month.

- `id uuid pk default gen_random_uuid()`
- `period_month date NOT NULL` — first day of the month; `CHECK (extract(day from period_month) = 1)`
- `payee_key text NOT NULL DEFAULT 'dispatch_company'` with `CHECK (payee_key = 'dispatch_company')`
- `status dispatch_settlement_status NOT NULL DEFAULT 'draft'` (section 2)
- `eligible_base numeric NOT NULL DEFAULT 0`
- `factoring_pct numeric NOT NULL`, `dispatch_pct numeric NOT NULL` — the rates **as applied**, copied onto the row
- `factoring_reduction numeric NOT NULL DEFAULT 0`, `reduced_base numeric NOT NULL DEFAULT 0`, `dispatch_fee numeric NOT NULL DEFAULT 0`
- `deductions_amount numeric NOT NULL DEFAULT 0`, `net_amount numeric NOT NULL DEFAULT 0`
- `computed_at timestamptz`, `approved_at/by`, `paid_at`, `notes text`
- `created_at/updated_at/created_by/updated_by` (`profiles(id) ON DELETE SET NULL`)
- `UNIQUE (payee_key, period_month)`

**`dispatch_settlement_line_items`** — every amount, one line, mirroring the
driver-side principle that the net is the sum of the lines.

- `id`, `dispatch_settlement_id uuid NOT NULL REFERENCES dispatch_settlements(id) ON DELETE CASCADE`
- `line_type text NOT NULL CHECK (line_type IN ('load_base','factoring_reduction','dispatch_fee','flat_deduction','one_off'))`
- `amount numeric NOT NULL` (signed)
- `description text NOT NULL`
- `load_id uuid REFERENCES loads(id) ON DELETE RESTRICT`
- `dispatcher_id uuid REFERENCES profiles(id) ON DELETE SET NULL` — attribution copy, visibility only (4.6)
- `deduction_id uuid REFERENCES dispatch_deductions(id) ON DELETE RESTRICT`
- `created_at`, `created_by`
- `CHECK (line_type <> 'one_off' OR load_id IS NOT NULL)` — section 4's load-reference requirement as a **database constraint**, not a convention
- `CHECK (line_type <> 'load_base' OR load_id IS NOT NULL)`
- `UNIQUE (dispatch_settlement_id, line_type, load_id)` for `load_base` via a partial unique index — one base line per load per month

**`dispatch_settlement_load_contributions`** (optional but proposed) — per-load
base breakdown: header component, charges included, charges excluded with the
resolved percentage that excluded them. Rejected alternative: folding this into
`description` text. Rejected because the exclusion predicate (4.3) is the part
most likely to be wrong and a diagnostic must be queryable, not parsed.

**`dispatch_deductions`** — DAT, phone service: `id`, `label text NOT NULL`,
`amount numeric NOT NULL CHECK (amount >= 0)`, `is_active boolean NOT NULL DEFAULT true`,
`effective_from date NOT NULL`, `effective_to date`, attribution columns.

**Borrowed from the driver side** (Q1/Q2/Q3): the every-amount-is-a-line-item
shape of `settlement_line_items`; `created_by/updated_by → profiles(id)`; the
`has_role(auth.uid(),'management'|'owner')` ALL policy plus a separate read
policy; a status column driving immutability.

**Deliberately NOT borrowed:** `settlements.operator_id` (NOT NULL, cascade FK
to `operators`) and its `UNIQUE (operator_id, period_start)` — replaced by
`UNIQUE (payee_key, period_month)`; `carry_forward_in/out`, `hold_*`,
`below_threshold_*`, `payday` as a driver-cycle date — none apply (4.8);
`settlement_line_items.source_table` CHECK (Q2 confirms its seven values are
driver-side) — replaced by explicit typed FK columns, which is stronger than a
text discriminator; `settlement_withheld_loads` entirely — there is no per-load
paperwork hold on the vendor side.

**Vendor identity.** Proposed: a **constrained singleton payee key**
(`payee_key` with a one-value CHECK) rather than a `vendors` table or an
unkeyed singleton. Rejected `vendors` table: it invents a directory nothing
populates and no rule references. Rejected bare singleton (one row, no key):
the month is already the natural key and a payee column makes the eventual
second vendor a CHECK relaxation plus a unique index that is already correct,
not a table redesign.

## 2. Status

`dispatch_settlement_status` — new enum, not `settlement_status` (4.8; two of
its five members are unreachable here per 4.7).

| Member | Transition cause | Who |
|---|---|---|
| `draft` | the writer computes a month | management/owner |
| `approved` | figures reviewed and accepted | management/owner |
| `paid` | payment issued (on or around the 10th) | management/owner |
| `void` | a draft or approved month is abandoned | owner |

Rejected: a `processing` member — that word is driver-facing vocabulary with a
defined meaning; reusing it invites confusion. Rejected: allowing `paid → void`.

## 3. Configuration

**`dispatch_settlement_rates`** — versioned, not a singleton:
`id`, `dispatch_pct numeric NOT NULL CHECK (dispatch_pct >= 0 AND dispatch_pct <= 100)`,
`factoring_pct numeric NOT NULL CHECK (...)`, `effective_from date NOT NULL`,
`effective_to date`, `CHECK (effective_to IS NULL OR effective_to > effective_from)`,
plus attribution and a history table mirroring `settlement_settings_history`
(Q1: field/previous/new/changed_by/changed_at).

Versioning is by effective-dating **plus** copying the applied rates onto
`dispatch_settlements` (`dispatch_pct`, `factoring_pct`). Rejected: rates on a
singleton like `settlement_settings` (Q1 confirms it has no home for them) —
a rate change would retroactively alter a settled month on re-read. Belt and
braces is deliberate: the effective-dated row explains *why*, the copied
columns guarantee the settled figure never moves.

One-offs are `line_type = 'one_off'` rows with the `load_id NOT NULL` CHECK
above. Rejected: a `dispatch_deductions` row flagged one-off — a recurring
table with a one-shot flag drifts.

## 4. What is shared, what is not

Read today (files, not migrations):

- `src/lib/settlementPeriod.ts` — `carrierDateOf`, `workPeriodForDate`, `deliveredInPeriod` (already pure).
- `src/lib/payTreatment.ts` — `payClassOf`, `PCT_FIELD`, `PayPolicyRates`, `fetchEffectivePayPolicy`.
- `src/lib/settlementEngine.ts` — carries its **own second copy** of `PCT_FIELD` (lines 271–281) and `resolveEffectivePolicy`.

Proposed extraction:

- `carrierDateOf` gains `monthOf(iso): string` (`YYYY-MM`) and `inCalendarMonth(iso, month)` in `settlementPeriod.ts`. The dispatch path calls these; nothing else moves.
- The duplicate `PCT_FIELD` in `settlementEngine.ts` is deleted and both paths import one map plus a new `pctForClassification(klass, policy): number | null` from `payTreatment.ts`. `resolveEffectivePolicy` moves to `payTreatment.ts`; `settlementEngine.ts` re-exports it so no call site breaks.
- `computeSettlement` stays where it is and is not extracted (4.7). A new pure `computeDispatchSettlement` lives in `src/lib/dispatchSettlement.ts`.

**How a test asserts the call rather than the re-derivation.** Three layers,
because intent is not evidence: (a) a spy test — `vi.mock` the shared module and
assert `pctForClassification` / `inCalendarMonth` were invoked with the expected
arguments during a dispatch computation, failing if the count is zero; (b) a
source guard in `src/test/` asserting `dispatchSettlement.ts` contains no
literal `_pct` string, no `new Date(` on a delivery value, and no month
arithmetic outside the shared import; (c) a behavioural coupling test — flip
`detention_pct` from 100 to 72 in the fixture policy and assert the dispatch
base **changes**, which a re-derived hardcoded list cannot pass.

## 5. The base predicate

Per load, columns from Q1 on `loads`:

- Eligibility (4.1): `delivered_at IS NOT NULL` AND `carrierDateOf(delivered_at)` falls in the month AND `status NOT IN ('tonu','cancelled')`. Timezone is `America/Chicago` via `isoToNaive` (`src/lib/carrierTimezone.ts`), never `new Date(v)`.
- Header base (4.2), by `rate_type`: `flat` and `percentage_of_load` → `linehaul_rate`; `per_mile` → `rate_per_mile * loaded_miles`; `per_ton` → `rate_per_ton * confirmed_tons` (**confirmed only**; `estimated_tons` never); `load_type = 'loadout'` → `loadout_relocation_fee`.
- FSC: add `fsc_amount` only when `fsc_bundled_into_linehaul IS FALSE` (NULL means bundled).
- `loads.total_load_value` is never read (4.2).
- Charges: add every `load_charges` row, then exclude when either (a) `pctForClassification(chargeClassification(charge_type), policyInForce) === 100`, reading the `*_pct` columns on `pay_policies` (Q1 confirms `detention_pct` 100, `layover_pct` 100, `lumper_reimbursement_pct` 100 by default), or (b) `payClassOf(...) === 'reimbursement'`. `charge_pay_classes` is **not** the exclusion source (4.3).
- Then: base × factoring_pct → reduction; base − reduction → reduced base; × dispatch_pct → fee; less flat deductions; less one-offs (4.5).

## 6. Writer and immutability

Single writer `public.compute_dispatch_settlement(p_month date, p_mode text default 'refuse')`:

1. `SECURITY DEFINER`
2. `SET search_path TO 'public','extensions'`
3. `REVOKE ALL ON FUNCTION ... FROM PUBLIC`
4. `REVOKE EXECUTE ... FROM anon` (no public route needs it)

Authorization inside the body: `has_role(auth.uid(),'management') OR
has_role(auth.uid(),'owner')`, raising `42501` otherwise — the same shape
`store_settlement_run` uses (Q4). Actor from `current_profile_id()`, stamped
server-side; the client never supplies it.

Idempotency: `p_mode` `refuse` (default) returns the existing row untouched;
`replace` deletes children and rewrites, and refuses outright when status is
`paid`. Same two-mode contract as `store_settlement_run` (Q4).

Immutability: its own trigger pair mirroring
`enforce_settlement_immutability` / `enforce_settlement_child_immutability`
(Q4 shows both are DEFINER, pinned, `anon_x=false`, `auth_x=false`, and gated by
`settlement_writer_active()`). Borrowing the *approach*, not the functions — the
driver-side ones read `settlement_status` and `settlements`. A separate
`dispatch_settlement_writer_active()` guard keeps the two write gates from
unlocking each other.

## 7. Build order

- **Pass 1 — schema.** Tables, enum, rates table, grants, RLS, triggers. Verified by a `settlement-foundation`-style live-catalog test asserting columns, CHECKs, grants and DEFINER protections.
- **Pass 2 — shared extraction.** The `PCT_FIELD` de-duplication and month helpers, with the three-layer caller test from section 4. Verified by the existing engine suites staying green.
- **Pass 3 — pure computation.** `computeDispatchSettlement` against the six seed loads: ST26056 proves the 100% detention exclusion; ST26058 the plain multi-stop case; ST26059 the per-ton confirmed-tons header; ST26060 the loadout fee and the unattributed bucket (`dispatcher_id` NULL); ST26061 exclusion by **status**; ST26063 the lumper exclusion alongside a TONU **charge** that stays in.
- **Pass 4 — writer and persistence**, then attribution rollup that must sum to the total.
- **Pass 5 — the management screen.**

## 8. What cannot be verified

All of this is **SEEDED-DATA EVIDENCE** and weaker than the Pratt run, per the
verification-standard entry. Specific gaps:

- No month boundary: every seed `delivered_at` lands in the same month in UTC and Central, so carrier-timezone attribution is asserted but not exercised.
- No rate change across a settled month, so the versioning in section 3 has nothing real to prove itself against.
- No reimbursement-class charge and no driver-funded lumper, so exclusion branch (b) is fixture-only.
- No `per_mile` load and no `percentage_of_load` load in the set, so two of the four `rate_type` branches are untested against real rows.
- No factoring or DAT amounts confirmed against a real invoice beyond the single figure already recorded.
- After the first green result, what stays unproven is that the exclusion predicate behaves under a *new* accessorial type configured at 100% — the automatic-drop-out intent in 4.3 — and that a second dispatcher's attribution reconciles across a month with a real volume of loads.

## CONTRADICTIONS

Two, both reportable rather than reconciled:

1. **Section 4.3 refers to "the classification-to-column mapping the engine already uses" as though it were one thing. There are two divergent copies.** `src/lib/payTreatment.ts` (`PCT_FIELD`) and `src/lib/settlementEngine.ts` lines 271–281 each define their own. They agree today, but the document's premise that a single mapping exists is not true of the code.

2. **`pay_policies.per_ton_pct` and `pay_policies.loadout_pct` exist in the live catalog (Q1) and are read by nothing.** A grep across `src/` and `supabase/functions` finds them only in generated `types.ts`. The engine values a loadout at `linehaul_pct` and per-ton linehaul at `linehaul_pct`, not at these columns. The document lists per-ton and loadout as header components (4.2) without naming which percentage governs, so this is not a direct contradiction of a stated rule — but it is an eighth instance of the "correct implementation with no caller" pattern, sitting in the exact table this proposal reads its percentages from, and it should be resolved before Pass 3 rather than inherited.
