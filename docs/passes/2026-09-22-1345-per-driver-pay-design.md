# Per-driver pay — DESIGN ONLY (2026-09-22 13:45 UTC)

Scope honoured exactly: the only files changed are `docs/tms-build-status.md`,
`docs/tms-wish-list.md` and this report. **No migration, no code, no data, no schema change.**
**The full suite was skipped — this is a documentation-only pass**, and nothing it touches is
executed by a test. `bunx tsgo --noEmit` was not run for the same reason: no TypeScript changed.

This pass absorbs **P31**. Its two open questions are answered by P41 below.

Read first, as instructed: `docs/passes/2026-09-22-1230-pay-policy-history.md` (Step 1 and
contradictions A–D), the 2026-09-10 and 2026-09-11 record entries on the per-driver fuel discount
pass-through, and the P26, P31, P35, P36 record entries.

**Contradiction check: none that requires a stop.** Three of the five decisions describe behaviour
that does not exist yet (that is the work, not a conflict); two match the live system exactly:

| Decision | Live system | Verdict |
| --- | --- | --- |
| P37 percentage on the staff driver page | `operators.pay_percentage` exists, owner-only by `ab_guard_operator_pay_percentage` (P35), and has **no UI anywhere** — `OperatorDetailPanel.tsx` never names it | Gap to build, not a conflict |
| P38 linehaul from his percentage | Settlements read **only** `pay_policies`; `operators.pay_percentage` is read solely by the driver's earnings forecast (`SettlementForecast/index.tsx:51`) | Gap to build — and the substance of the pass |
| P39 builder fills in from the driver page | `ICABuilderModal.tsx:161,257` defaults `linehaul_split_pct` to a **hardcoded 72**, never reading the driver record; no mismatch flag exists | Gap to build |
| P40 pass-through stays in Settlement Settings | Exactly as built 2026-09-11: company toggle on the default policy + driver exceptions via `set_operator_fuel_discount_passthrough` | Already true, unchanged |
| P41 percentages versioned; index re-scoped | Matches the 1230 report's own recommendation (contradictions A and B) | Answers the stop |

---

## Step 1 — the owner's decisions, recorded as P37–P41 (2026-09-22)

- **P37.** Each driver's linehaul percentage is set on his **staff-side driver page** (Management /
  Staff driver detail), not in the driver's own app. Changing it is **owner only**
  (`driver_pay.change`, as today).
- **P38.** Settlements pay a driver's **linehaul** from **his** percentage. Every other rate — fuel
  surcharge, detention, layover, TONU, stop-off, lumper and the rest — follows the **company pay
  policy** unless a driver-specific override is set later.
- **P39.** The agreement builder **fills in** the driver's percentage from his driver page. If a
  signed agreement and the driver-page percentage ever disagree, the system **flags it**; it never
  silently pays one of them.
- **P40.** The fuel discount pass-through stays in **Management → Settlement Settings**,
  company-wide plus driver exceptions, exactly as built on 2026-09-11.
- **P41.** Pay history is kept. A percentage change — the driver's or the company policy's — takes
  effect **from a date**, and a past work week is always calculated with the rate **in force for
  that week**. **Only the percentages are versioned**; the fuel pass-through switch stays an
  in-place setting. The single-company-default index is **re-scoped to current versions only**, as
  P34 did for dispatch settlements.

---

## Step 2 — the starting point, counted live

```
ica_contracts.linehaul_split_pct   72  → 65 rows   (no other value, no NULLs)
operators.pay_percentage           72  → 157 rows  (no other value, no NULLs)
pay_policies.linehaul_pct          72.00 → 1 row   (SUPERTRANSPORT Standard, company default)
```

**Nothing differs from 72.** The owner's premise holds on all three tables, so the whole build
starts from a state in which every possible resolution order produces the same number — which is
what makes the "nothing moves" proof in Step 5 available at all.

---

## Step 3 — the options for storing a driver's percentage with its history

The eight readers and three definer functions named in the 1230 report, restated so each option can
be scored against them:

1. `settlementRun.ts:187` — company default, `.eq('is_company_default', true).maybeSingle()`, **no
   date test**
2. `settlementRun.ts:188-190` — every `pay_policy_assignments` row, kept on overlap with the **work
   period**
3. `dispatchSettlementRun.ts:111-141` — the same shape, overlap against the **month start**
4. `payTreatment.fetchEffectivePayPolicy` — assignment effective **today**, else company default
   `ORDER BY effective_date DESC LIMIT 1`
5. `LoadChargesCard` (via 4)
6. `RevisedRateConModal` (via 4)
7. `FuelDiscountPassthroughSettings.tsx:117` — **writes** the default policy in place
8. `discountPassthrough.ts` — company default `.maybeSingle()` for the switch
9. definer `driver_load_pay_estimate` — whole policy row, Chicago today
10. definer `create_accessorial_adjustment` — company default, `ORDER BY effective_date DESC LIMIT 1`
11. definer `my_fuel_transactions` — `is_company_default LIMIT 1`, the switch only

Plus the **earnings forecast** (`SettlementForecast/index.tsx:51`, `OperatorPortal.tsx:365`), which
reads `operators.pay_percentage` and nothing else — today the only reader of a driver's own number.

### (a) `operators.pay_percentage` as the current value + a dated history table

A new `operator_pay_percentage_history` (operator, pct, `effective_from`, `effective_to`, reason,
actor), append-only; `operators.pay_percentage` keeps the current value as a convenience mirror.

- **Changes:** one new table, one writer RPC, the P35 guard extended to the history table.
- **Readers touched:** readers 1–3 gain a linehaul-only lookup against the driver's history; the
  forecast switches to the history row in force. Readers 4–6 and 9–11 keep reading the company
  policy for every non-linehaul rate — **untouched**, which is the option's main attraction.
- **Past week:** the row whose `[effective_from, effective_to]` covers the week's start; exactly one
  by construction.
- **Line record:** the resolved percentage and the history row id on each linehaul line.
- **Risks:** a **second source of pay truth** beside `pay_policies`, so two resolution orders exist
  forever and a future driver-specific *detention* rate has nowhere sensible to go. The mirrored
  current value can drift from its own history.

### (b) Per-driver `pay_policy_assignments` pointing at a driver-specific policy

Each driver gets his own `pay_policies` row (linehaul his, everything else copied), assigned by a
dated `pay_policy_assignments` row; a change closes the old assignment and opens a new one.

- **Changes:** no new table. Both settlement runs **already** resolve assignment-first by date.
- **Readers touched:** all of them, because every non-linehaul rate would now come from the
  driver's own copied row — so a later company change to detention would **not** reach him. That is
  a silent contradiction of P38.
- **Past week:** already correct — the assignment dates overlap the work period.
- **Risks:** 157 near-duplicate policy rows, each a place for the other ten percentages to rot.
  Rejected for that reason alone; the 2026-09-10 record already draws this distinction ("rates
  belong in pay policies; this is a switch").

### (c) RECOMMENDED — versioned `pay_policies` (P41) + a **linehaul-only** dated driver override

Two halves, both needed, neither duplicating the other:

1. **The company policy becomes versioned**, as P41 states: add `effective_from` / `effective_to`;
   backfill version one's `effective_from` to `least(effective_date, earliest settlement
   period_start, '2000-01-01')` so it covers every existing settlement **without editing the real
   `effective_date`**; re-scope `pay_policies_single_company_default` to `WHERE is_company_default
   AND effective_to IS NULL`; append-only guard requiring `pay_policy.change`, the only permitted
   update on a closed version being its `effective_to`; delete refused for everyone.
   `fuel_discount_passthrough`, `name`, `description`, `is_active` stay **in-place** updates, so the
   2026-09-11 screen and P40 keep working.
2. **A driver's linehaul percentage becomes a dated override of one column**, in a new
   `operator_linehaul_pct_versions` table (operator, pct, `effective_from`, `effective_to`, reason,
   actor, source: `driver_page` | `agreement` | `backfill`), append-only, written only by an
   owner-gated RPC. `operators.pay_percentage` stays as the **current** value, written by the same
   RPC in the same statement, so the forecast and the P35 guard need no change of shape.
   **Only `linehaul_pct` is overridable.** Every other rate resolves from the company version in
   force — P38, enforced by the schema rather than by discipline.

- **Readers touched:** readers 1, 3, 8, 10, 11 gain a date test (`effective_from <= d AND
  (effective_to IS NULL OR effective_to >= d)`) — which they need in any case the moment a second
  version exists, per contradiction C. Reader 4 resolves against **today** and keeps doing so.
  Readers 2, 5, 6, 9 are unchanged in shape. The forecast keeps reading
  `operators.pay_percentage`, which is now guaranteed to equal the current version.
  One shared resolver, used by every caller: `resolveLinehaulPct(operatorId, asOfDate)`.
- **Past week:** the settlement run already knows its work week. The company version is the one
  covering `period_start`; the driver's linehaul is his version covering the same date, else the
  company version's `linehaul_pct`. A recompute of a draft therefore produces the same number as
  the first computation, which it does **not** today.
- **Line record:** mirror what dispatch already does. Add `pay_policy_id`, `resolved_pct` and
  `pct_source` (`operator_version` | `company_policy`) to `settlement_line_items`, nullable, so the
  one existing line stays valid and every new line says what produced it.
- **Risks, stated plainly:** it is the largest of the three (two new dated dimensions at once), and
  every reader that keeps a stale `.maybeSingle()` becomes an error the moment version two exists —
  which is why Pass 1 in Step 5 adds the date tests **before** any second version can be created.

**Recommendation: (c).** It is the only option that keeps one place for rates and still lets a
driver's linehaul differ; it satisfies P38 by construction rather than by convention; it reuses the
P34 index precedent the owner has already accepted; and it leaves the fuel pass-through, the
forecast and the P35 guard exactly where they are.

---

## Step 4 — the screens, described not built

**The staff-side driver page** (`src/pages/staff/OperatorDetailPanel.tsx`). A **Linehaul Pay** card
where the deleted fuel card used to sit, above Settlement Forecast, visible to management and the
owner. It reads: the current percentage in large type, the date it took effect, and beneath it
"Company policy: 72%" when the driver simply follows the company. Management sees the figure and
the history; **only the owner sees the Change button** (`driver_pay.change`).

**Changing it** opens a small form, never an inline editable field: the new percentage, an
**effective date** (defaulting to the start of the *next* work week, with a warning — not a refusal
— if a past date is chosen, naming the settlements that date would reach), and a required reason.
The confirm step spells the consequence in one sentence: "Loads delivered from Wed 30 Sep onward pay
82%. Weeks already settled are unaffected." Below the card, a plain dated list of every past version
with its reason and who set it.

**The agreement builder.** `ICABuilderModal` stops defaulting to a hardcoded 72 and pre-fills
`linehaul_split_pct` from the driver's current percentage, shown as pre-filled ("from his driver
page: 72%") and still editable while the agreement is a draft — after which P35 locks it to the
owner. If the builder is opened with a percentage that differs from the driver page, the field
carries the amber note "differs from his driver page (72%)" and the builder offers both directions:
adopt the driver page value, or keep this one and update the driver page from it (the latter being
an owner action).

**The P39 mismatch flag.** Computed, never stored: a driver's current percentage compared with the
`linehaul_split_pct` on his latest agreement at `sent_to_operator` or later. It appears in three
places and nowhere else — an amber row on the Linehaul Pay card ("His signed agreement says 72%,
his driver page says 82%. Settlements are paying 82%."), a count on the Management compliance
surface next to the existing pay items, and a named line on the settlement run's pre-flight review
so the person approving a settlement sees it **before** money moves. **Drivers never see it**: it
is a staff discrepancy about a document, and the driver-facing rule that he is never shown a gross
or a split percentage (`driverLoadPay.ts`) stands unchanged. The flag never picks a winner —
settlements pay the driver page (P38) and say so in the flag's own wording.

---

## Step 5 — the build plan, in passes, each with its proof

**The proof that must pass in every pass, unchanged:** the one driver settlement (`f77911b0`,
2026-08-12 → 2026-08-18, paid, gross = net = **327.94**, 1 line item) still reads and recomputes to
**327.94**; the one dispatch settlement's 3 charge verdicts keep their stored `resolved_pct`; Steve
Figueroa's forecast and driver screens show the same figures as before (his contract
`f5da30b8` is `fully_executed` at 72, his `pay_percentage` is 72); the live fixture suites
(`settlementEngine`, `settlementRun`, `fuelDiscountPassthroughOverride`, `mySettlements`,
`operator-pay-exposure`, `operator-fuel-isolation`, `sharedPayPct`) stay green. Because **every
value is 72 today** (Step 2), any change of resolution order that moves a figure is a defect by
definition — the strongest proof this project has had available for a pay change.

- **Pass 1 — date-test every reader, with one version still in existence.** No schema change beyond
  adding nullable `effective_from` / `effective_to` and backfilling version one to cover everything.
  All eleven readers routed through one resolver; `.maybeSingle()` replaced by a dated single-row
  read. *Proof:* every figure above identical before and after; a test that inserts a throwaway
  second version in a transaction that raises, showing each reader picks the right one and none
  errors; `function-reachability`, `definer-search-path`, `definer-live-catalog`, `grant-parity-live`
  green.
- **Pass 2 — versioning the company policy for real.** Re-scope
  `pay_policies_single_company_default` to `effective_to IS NULL`; append-only guard requiring
  `pay_policy.change`; delete refused; in-place columns named explicitly so the P40 screen keeps
  working. *Proof:* in a rolled-back transaction — a second current default refused, a closed
  version plus a new current accepted, a closed version's percentage refused, its `effective_to`
  accepted for the owner and refused for Mae and Leo, the fuel toggle still saving.
- **Pass 3 — the driver's linehaul version table and its owner-gated writer.** Backfill one version
  per driver at 72 from a date before every settlement. *Proof:* 157 versions, all 72, all covering
  the only settlement; the settlement still 327.94; the forecast unchanged; the writer refused for
  Mae and Leo and accepted for Marcus; no reason → refused.
- **Pass 4 — the settlement line record.** `pay_policy_id`, `resolved_pct`, `pct_source` on
  `settlement_line_items`, nullable. *Proof:* the existing line untouched and still readable; a new
  draft recording its rate; a recompute after a policy change producing the **same** number for a
  past week, which is the defect this whole design exists to close.
- **Pass 5 — the screens.** The Linehaul Pay card, the dated-change form, the builder pre-fill, the
  P39 flag in its three places. *Proof:* rendered in the browser as the owner and as Mae (no Change
  button); a deliberate mismatch created in a rolled-back transaction and seen on all three
  surfaces; `operator-pay-exposure` still proving no driver surface shows a percentage or a gross.

Passes 1 and 2 must ship in that order, and **no second version may be created until Pass 1 is
green** — contradiction C, read as a sequencing rule.

> **2026-09-22 1400 — PASS 1 IS GREEN, so the gate is lifted.** Every reader now resolves the
> version in force on its own date through one resolver stated twice
> (`public.company_pay_policy_on()` and `src/lib/payPolicyVersion.ts`); migration `0037` added the
> effective window and backfilled version one. Proved against a throwaway second version in a rolled
> back block, including the two reads that would have thrown or served a future rate. A second policy
> version may now be created — that is Pass 2, which also re-scopes
> `pay_policies_single_company_default`. Report
> `docs/passes/2026-09-22-1400-per-driver-pay-pass-1.md`.

---

## Recorded

- `docs/tms-build-status.md` — P37–P41 and this design under one dated heading.
- `docs/tms-wish-list.md` — per-driver pay: **designed, awaiting the owner's choice of option**
  (recommendation (c)); P31 absorbed.
- `docs/passes/2026-09-22-1345-per-driver-pay-design.md` — this file.

Nothing else was written. **Full suite skipped: documentation-only pass.**
