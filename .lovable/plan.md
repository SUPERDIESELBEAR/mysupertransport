# Module 6 — Fuel Management: design proposal (Pass 2 onward)

Read-only. Every schema claim below is marked CATALOG (live `pg_catalog` /
`information_schema` query this turn), DATA (live row query this turn), or
SOURCE (current file contents). Nothing was changed.

Two things in the brief do not survive contact with the live system. They are in
CONTRADICTIONS at the end, not reconciled here.

---

## 1. What Pass 1 actually built

### Tables (CATALOG)

`fuel_import_batches` — `id, provider (fuel_provider, default 'multiservice'),
file_name, row_count, imported_count, duplicate_count, matched_count,
unmatched_count, disagreement_count, flagged_count, date_range_start,
date_range_end, total_amount, reconciliation_ok, imported_by, imported_at,
created_at, updated_at`. Constraints: PK, FK `imported_by → profiles`.

`fuel_transactions` — 38 columns: `id, batch_id, operator_id,
matched_equipment_id, card_no, unit_no, driver_name, city, state, invoice_no,
invoice_date, daycode`, twelve money/quantity columns (`diesel_amount,
diesel_gallons, reefer_amount, additive_amount, minor_repairs_amount,
misc_amount, tires_amount, cash_advance_12digit_amount,
cash_advance_emoney_amount, cash_advance_insta_amount, def_amount, def_quantity,
fees_amount, fuel_discount_amount, total_amount`), then `match_status
(fuel_match_status), disagreement_fields jsonb, reconciliation_ok,
reconciliation_delta, resolved_by, resolved_at, resolution_note`, plus the four
standard stamps. Constraints: PK; **UNIQUE `(invoice_no, invoice_date, card_no)`**
(`fuel_transactions_dedup_key`); FK `batch_id → fuel_import_batches` CASCADE;
`operator_id → operators` SET NULL; `matched_equipment_id → equipment_items` SET
NULL; `created_by/updated_by/resolved_by → profiles`.

`fuel_transaction_lines` — `id, transaction_id, line_type (fuel_line_type),
amount, quantity, created_at`. UNIQUE `(transaction_id, line_type)`; FK to
`fuel_transactions` CASCADE.

Enums (CATALOG): `fuel_line_type` = diesel, reefer, def, additive, minor_repairs,
misc, tires, cash_advance_12digit, cash_advance_emoney, cash_advance_insta, fees,
fuel_discount. `fuel_match_status` = matched, unmatched,
matched_with_disagreement. **`fuel_provider` has exactly one label:
`multiservice`.** Comdata is not in the type.

### RLS (CATALOG)

All three tables: read `is_staff(auth.uid())` (SELECT, authenticated), write
management-or-owner (ALL). No operator-facing policy anywhere in fuel — correct
for Pass 1, and it means a driver cannot yet see his own fuel outside a
settlement.

### Functions (CATALOG — all `prosecdef = true`, all
`search_path=public, extensions`)

`preview_fuel_import(_rows jsonb)`, `commit_fuel_import(_file_name, _provider,
_rows)`, `assign_fuel_transaction_operator(_transaction_id, _operator_id,
_note)`, `fuel_resolve_card(_card_no, _on_date)`, and
`fuel_normalize_name(_name)` (the only non-definer).

### The import path, end to end (SOURCE)

`src/pages/management/FuelImportPage.tsx` (440 lines) → `parseMultiserviceCsv`
in `src/lib/fuel/multiserviceCsv.ts` — a pure parser that validates a
**23-column header verbatim** and throws `FuelCsvFormatError` on any rename,
addition or removal → `previewFuelImport` → `preview_fuel_import` (dry run,
returns per-row match/duplicate/reconciliation verdicts) → `commitFuelImport` →
`commit_fuel_import` (creates the batch, inserts transactions and derived lines).
Unmatched and disagreeing rows land in a review queue read straight off the
table by `fetchFuelReviewQueue`; the single writer for the unmatched → matched
transition is `assign_fuel_transaction_operator`.

Matching: card first, date-scoped through `fuel_resolve_card` against
`equipment_assignments`; printed unit and driver name are confirmation only and
produce `matched_with_disagreement` rather than overriding; an unresolvable card
is `unmatched`. Reconciliation flags, never drops.

### Live contents (DATA, this turn)

`fuel_import_batches` **0**, `fuel_transactions` **0**, `fuel_transaction_lines`
**0**. Also `cash_advances` **0**, `deductions` **0**, and **no** pay policy has
`fuel_discount_passthrough` true.

### Works today vs. what the record implies

Works: parse, preview, commit, dedupe, date-scoped card attribution, review
queue, batch history, reconciliation flagging, deduction into a settlement.

Not supported by the code: the build context lists `fuel_provider` as
`multiservice/comdata` — the live enum has only `multiservice`. And the
297-row live export the Pass 1 record was written against is **not in this
database**; the tables are empty.

---

## 2. How fuel reaches a settlement today

SOURCE, `src/lib/settlementRun.ts:241-248`:

```
sb.from('fuel_transactions')
  .select('id, operator_id, total_amount, fuel_discount_amount, invoice_no, invoice_date')
  .not('operator_id', 'is', null)
  .gte('invoice_date', period.periodStart)
  .lte('invoice_date', period.periodEnd),
```

The period bound **is present** and is on `invoice_date`. The exclusion set
(`settledSourcesEver`, line 348) is a second, independent lock. The defect the
brief describes was fixed; the comment at line 257 now cites it as the *reason*
the adjustment read carries its own bound.

**Should it be period-bounded, and on what?** Yes, and on `invoice_date` —
which is where it already is. The three candidates:

- **Transaction/invoice date** (chosen). It is the date the money left the card,
  it is on the row, it is what the driver's own receipt says, and it is stable:
  re-importing an overlapping export cannot move a transaction between weeks.
- **Posting date** — rejected: MultiService does not print one in the 23-column
  export, so it would have to be invented at import time, and an invented date
  is a pay rule written by the importer.
- **Import batch** — rejected outright. It makes the driver's deduction depend on
  *when staff got round to uploading*. A late upload would dump three weeks of
  fuel onto one settlement.

The residual weakness worth a named pass: fuel bought inside a period but
imported *after* that period settled is never deducted, because the bound
excludes it and the settlement is already closed. That is a **late fuel**
problem structurally identical to the late accessorial (`-A1`) and should be
solved the same way — carried into the next open period with a visible
attribution back to its real week — not by widening the bound.

---

## 3. Comdata

What I can state from this repository: nothing in `src/lib/fuel/` mentions
Comdata (SOURCE), the provider enum excludes it (CATALOG), and no Comdata file
exists here to inspect. I will not describe Comdata's field layout from memory
and present it as a finding — the record's standard is a live read, and there is
nothing live to read.

**Does the Pass 1 path generalise? Partly, and the seam is not where it looks.**

- `multiserviceCsv.ts` is MultiService-specific by construction: a frozen
  23-column header, fixed positional indices (`c[15]`, `c[16]`, `c[17]`), and a
  `deriveLines` map hard-wired to those column names. It cannot be extended; a
  Comdata parser is a **new sibling module**, not a modification.
- `fuel_transactions` is MultiService-shaped at the column level — twelve named
  money columns matching MultiService's categories exactly. Comdata categories
  that do not map land nowhere.
- What *does* generalise, and is the real seam: `ParsedFuelRow` +
  `fuel_transaction_lines`. The line table is already category-per-row and
  already the canonical breakdown. Everything downstream of it — dedupe key,
  card resolution, review queue, batch stats, the settlement read — is
  provider-agnostic already.

**Proposal.** Make `ParsedFuelRow` the provider contract: each provider ships its
own pure parser producing that shape, plus its own line derivation. Add
`comdata` to `fuel_provider`. Do **not** add Comdata columns to
`fuel_transactions`; extend `fuel_line_type` instead and let unmapped categories
be lines, keeping the flat columns as a MultiService legacy view of the same
lines. **Rejected alternative:** a generic column-mapping config table driving
one parser. It moves a format contract from code, where the tests bite, into
data, where a wrong mapping silently produces wrong money.

**Rejected alternative for the dedupe key:** reusing
`(invoice_no, invoice_date, card_no)` for Comdata unprovem. It must be
re-established against a real file before Comdata rows are written; if Comdata's
identifier is genuinely unique the key should be provider-scoped rather than
shared.

---

## 4. Cash advances

**What exists (CATALOG).** `cash_advances`: `operator_id, amount, source,
issued_on, remaining_balance (default 0), repayment_status (CHECK: outstanding |
repaying | repaid | written_off), notes` + stamps. One policy: management-or-owner
ALL. **No triggers on the table at all** — the "populated by trigger" phrasing in
the record means the *opposite* of what it sounds like: the table is a
**population trigger for a settlement run** (it pulls a driver into a run), not a
table written by a database trigger.

**What writes it: nothing.** No function in `public` writes `cash_advances`
(CATALOG), and no source file outside the settlement read and test fakes
references it (SOURCE). **A dispatcher cannot issue an advance today** — and by
RLS a dispatcher never will; the policy is management-or-owner.

**What reads it:** `settlementRun.ts:248` (all rows, no period bound, no status
filter), summed per operator into `advanceBalance`, used only for population.
Line 447 passes `advances: []` to the engine deliberately. The engine *can* pay a
`cash_advance` line (`settlementEngine.ts:597-608`) but is never given one.

**Proposed missing path.**

- `issue_cash_advance(operator_id, amount, source, notes, schedule)` — one RPC,
  the four standard protections, management or owner in the body, actor from
  `current_profile_id()`. **Rejected alternative:** a dispatcher-issued advance.
  It would need an RLS widening on a money table to a role the record keeps out
  of every settlement surface.
- **Recovery: instalments by default, full recovery as an explicit option.** An
  advance is a cash-flow bridge; recovering $1,500 in full from one settlement is
  the event that produces a negative net and a driver with no pay. Reuse
  `deduction_installments` (`installment_number / installment_total / due_payday /
  settlement_id` already exist, CATALOG) rather than inventing a schedule on
  `cash_advances`. **Rejected alternative:** a `weekly_recovery_amount` column on
  `cash_advances` — a second, parallel instalment mechanism whose "N of M" the
  driver's statement would have to render twice.
- **When net will not cover it:** recover only up to what net allows, down to
  zero, never below; the shortfall stays on `remaining_balance` and rolls to the
  next period, and the settlement shows the partial recovery with the remaining
  balance. **Rejected alternative:** driving net negative into carry-forward. The
  advance was already the driver's cash-flow problem; compounding it into a
  negative settlement makes the next week worse and is the behaviour the R&M rule
  deliberately avoids.
- **Priority when net is constrained:** R&M deposit first (it is the driver's own
  money, and it is capped and small), then fuel (a pass-through of money already
  spent), then advance recovery, then discretionary deductions.

All four of these are the open questions §9 of the Module 4 record says may not
be implemented on a guess. **This proposal is a recommendation for the carrier to
ratify, not a decision.** Nothing above may be built until Marc records the
answer.

---

## 5. DEF and maintenance purchases

**DEF is machine-distinguishable, not human-classified.** `Bulk DEF Amount` and
`Bulk DEF Quantity` are their own columns in the MultiService export, and
`deriveLines` emits a `def` line with `quantity` whenever the amount is non-zero
(SOURCE, `multiserviceCsv.ts`; test `splits a diesel-plus-DEF row`). 78 of the
297 rows in the reference export carried more than one category. No human
classifies DEF. It is a fuel-class pass-through and needs no approval.

**Maintenance approval: nothing implements it.** `minor_repairs_amount` is
parsed, stored, and emitted as a `minor_repairs` line (SOURCE) — and then
disappears. The settlement read selects only `total_amount` and
`fuel_discount_amount`, so a repair on the fuel card is **already being deducted
from the driver in full, inside `total_amount`, with no approval and no separate
line** (SOURCE, `settlementRun.ts:243`). That is the sharpest finding in this
proposal, and it is a live behaviour, not a gap.

**Proposal: its own approval path, not the accessorial adjustment machine.**

Reuse looks free and is not:

- The adjustment machine is keyed to a **load** (`UNIQUE (load_id, sequence)`,
  `reference` composed from the load number, `assert_charge_entry_allowed` on the
  load's money state). A repair has no load. Every one of those would need a
  nullable path, which is exactly how a constraint stops constraining.
- An adjustment **pays the driver** at a policy percentage and feeds the invoice.
  A maintenance purchase **charges the driver** and touches no invoice. Sharing
  the state machine means sharing the settlement seam, and the seam's whole job
  is to know a row's sign and its readers.
- Its immutability rule differs: an approved adjustment freezes because it has
  been billed to a broker. An approved repair freezes because it has been
  deducted from a person.

Instead: a small approval on the fuel row itself — `approval_status
(auto_approved | pending | approved | rejected)`, `approved_by`, `approved_at`,
`approval_reason` on `fuel_transactions`, with a definer writer and the same four
protections, and a threshold from settings (not a literal) above which a
`minor_repairs`/`misc`/`tires` line goes `pending` and is **withheld from the
deduction** until decided. What it *does* reuse is the shape the record already
proved: definer writer, role gate in the body, actor from `current_profile_id()`,
one writer per transition, immutability after approval. Reuse the **pattern**,
not the table.

---

## 6. The discount and the pass-through

`pay_policies.fuel_discount_passthrough` is live, default false, and **no policy
has it true** (DATA). Read in exactly two places (SOURCE): `payTreatment.ts:64,70`
selects it as part of the policy columns; `settlementEngine.ts:567-594` applies
it.

What it does: the engine deducts the **gross** — `total_amount + |discount|`,
computed at `settlementRun.ts:350-354` because `fuel_transactions.total_amount`
is already net of the negative discount. With pass-through **on**, the discount
is credited back as its own positive `fuel` line, "Fuel discount passed through".
With it **off**, the same gross is deducted and no credit line appears.

**Who keeps the discount today: the company.** Code and record agree exactly —
the deduction figure is identical either way, only the credit line appears or
does not, and the flag is forward-only from the policy's effective date. No
divergence found.

---

## 7. What must not diverge — the four readers

| Reader | Sees fuel? |
|---|---|
| Driver settlement (`computeSettlement`) | **Yes** — negative `fuel` lines, plus the discount credit when pass-through is on |
| Invoice builder (`invoiceBuilder.ts` / `loadRateParts.ts`) | **No.** Fuel is not a load part; the broker is never billed for it |
| Dispatch base (`dispatchSettlement.ts`) | **No.** The dispatch vendor is paid on load revenue |
| `loads.total_load_value` | **No.** Fuel has no `load_id` at all (CATALOG — `fuel_transactions` has no FK to `loads`) |

Fuel has exactly one reader, and the structural reason it cannot leak into the
other three is that a fuel transaction carries no load reference. Any future pass
that adds one — a lumper funded on the fuel card is the obvious candidate, and
the wish list already names it — creates the first path by which fuel could reach
an invoice, and must be treated as a settlement-and-billing change, not a fuel
change.

---

## 8. Build order and verification

**Pass 2 — cash advance issue and recovery.** Blocked on the carrier ratifying
the four §4 decisions. Verifiable end to end against seeded rows; no external
file needed.

**Pass 3 — maintenance approval and the withheld repair line.** Fixes the live
full-deduction behaviour in §5. Verifiable against a seeded fuel row; the
threshold and the withholding are pure logic and testable both directions.

**Pass 4 — late fuel.** The §2 residual: fuel imported after its period settled.
Verifiable synthetically.

**Pass 5 — Comdata.** Last, deliberately: it is the only pass with an external
dependency.

**What can be verified against real data: nothing in fuel, today.**
`fuel_transactions`, `fuel_transaction_lines`, `fuel_import_batches`,
`cash_advances` and `deductions` are all **empty** (DATA). Every fuel figure in
Pass 1's record came from a 297-row export that is not in this database.
Verification of Passes 2-4 will be against **seeded rows produced by the real
importer from the real CSV** — parser output, not hand-authored fixtures, per the
standing rule — and every seeded row must be registered on the cutover purge
procedure the day it is created.

**Comdata cannot be verified without a real Comdata file.** Not partially, not by
analogy. The header contract, the money formats, the dedupe key and the
card→driver mapping are all facts about a file nobody here has seen. Pass 5 does
not start until the file exists.

---

## CONTRADICTIONS

**Two found. Neither reconciled.**

1. **The brief states `gatherSettlementRun` reads `fuel_transactions` "with NO
   period bound".** It has one. `src/lib/settlementRun.ts:245-246` carries
   `.gte('invoice_date', period.periodStart).lte('invoice_date',
   period.periodEnd)`, and the comment at line 257 cites the fuel defect as the
   settled reason the adjustment read carries an independent bound. The defect
   was fixed; the brief describes the pre-fix state. The question the brief asks
   is still worth answering, and §2 answers it — the answer is that the existing
   choice, `invoice_date`, is the right one.

2. **The brief states "there are live fuel transactions from the MultiService
   import".** There are none. `fuel_transactions` 0, `fuel_transaction_lines` 0,
   `fuel_import_batches` 0 (DATA, this turn). No part of Module 6 can be verified
   against real data until a file is imported into this database.

Also noted, smaller: the build context lists the fuel provider enum as
`multiservice/comdata`; the live `fuel_provider` type has only `multiservice`
(CATALOG). Not a contradiction with the Module 6 record, which correctly treats
Comdata as unbuilt.
