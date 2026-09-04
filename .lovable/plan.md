# Module 7 — Billing & Invoicing: design proposal

Read-only pass. No code, no migrations. Every schema claim below is from a live
catalog query (`information_schema.columns`, `pg_proc`, `pg_enum`) or a live data
query, stated as such. Function bodies were read from `pg_proc` (the live
definition), not from migration text.

**Live baseline (queried):** `invoices`, `invoice_line_items`,
`supplemental_invoices`, `payments`, `ar_aging_snapshots`, `accessorials`,
`accessorial_adjustments`, `detention_records` — **none exist**. Live data: 16
loads (6 `delivered`, 1 `ready_to_invoice`, 1 `tonu`, 2 `cancelled`), 4
`load_charges`, 11 brokers (1 `approved`, 9 `unknown`), 1 driver settlement, 1
dispatch settlement.

---

## 1. What an invoice is

**Proposal: one invoice per load**, keyed `load_id` UNIQUE, with an optional
`broker_id` snapshot and a `batch_id` for the submission grouping.

Rejected — **per broker per period**: the schema is load-centric.
`loads.broker_id` is nullable (live: 1 of 16 loads has none),
`load_charges.load_id` is NOT NULL, `assert_charge_entry_allowed(p_load_id)`
gates money by LOAD status, and the billing statuses live on
`loads.status` (`ready_to_invoice → invoiced → factored → paid → settled`, from
`pg_enum`). A period invoice would need a second, parallel state machine and
could not answer "is this load billed?" without an aggregate. Factoring also buys
loads individually.
Rejected — **per stop / per charge**: no broker bills that way.

Batching is still needed (the factor receives many invoices at once), so it is a
`invoice_batches` grouping over per-load invoices — the same shape as
`fuel_import_batches`.

**Composition — different from both settlement bases, deliberately.**

| | Driver settlement | Dispatch base | **Invoice** |
|---|---|---|---|
| header rates | from parts | from parts | **from parts** |
| 100%-class charges (detention, layover, lumper) | paid to driver | EXCLUDED (4.3) | **INCLUDED** |
| reimbursement-class charges | at cost to funder | EXCLUDED | **INCLUDED** |
| broker chargebacks | deducted from driver | do not reduce base (4.4) | **reduce the amount received, not the invoice** |

The broker owes everything on the rate confirmation. The exclusion predicate in
4.3 answers "is there carrier margin here for a 5% to come out of" — that
question does not exist on the broker side. So the invoice amount is
**everything**: header rate (`linehaul_rate`, or `rate_per_mile × loaded_miles`,
or `rate_per_ton × confirmed_tons`, or `loadout_relocation_fee`) + `fsc_amount`
when `fsc_bundled_into_linehaul` is explicitly false + **all** `load_charges`.

**It must still be built FROM PARTS, not read from `loads.total_load_value`.**
Two live reasons. (a) `recompute_load_total_value` (read from `pg_proc`) falls
back `coalesce(confirmed_tons, estimated_tons, 0)` on per-ton — invoicing on
estimated tons bills a figure the scale ticket contradicts. (b) the recorded
loadout defect: for `load_type = 'loadout'` that function sets the total to
`loadout_relocation_fee` alone and never adds the charge sum. Both are already
in the record; the invoice must not inherit either. `total_load_value` stays what
it is — a display/estimate column.

Rejected — **snapshot only, no parts**: an invoice must be immutable once sent,
so it stores its own frozen line items; but it must be *derived* from parts at
build time, then frozen. That is the dispatch-settlement pattern (compute pure →
persist → read stored) and it is reused wholesale.

## 2. The factoring path

Four timestamps on the invoice, not four tables:
`submitted_at → purchased_at → paid_at → reconciled_at`, each with an actor,
mirroring `dispatch_settlements` (`computed_at/approved_at/paid_at` + `paid_by`,
live columns).

Load status advances alongside: `invoiced` on submit, `factored` on purchase,
`paid` on funding. `loadStatusFlow.ts` already permits `invoiced → factored | paid`
(direct-bill skips `factored`).

**Where the 2% goes: on the PAYMENT, not the invoice.** The invoice is the
broker-facing amount and the broker owes 100% of it. The factor's 2% is a
financing cost the carrier pays, visible only in what actually lands. So the
payment row carries `gross_amount`, `fee_amount`, `reserve_amount`,
`net_deposited`. Rejected — putting it on the invoice: it would make the
broker-facing document disagree with itself, and it would let the invoice total
drift from the dispatch base (see §5). Note this is a *different* 2% from
`dispatch_settlement_rates.factoring_pct` (live: 2.00, effective 2026-01-01),
which is a base reduction in the vendor settlement — the two must never be
netted against each other or read from the same row.

**Unfactorable brokers.** `brokers.factoring_status` is live with
`approved / not_approved / unknown / pending`, plus `do_not_load`,
`payment_terms`, `avg_days_to_pay`, `billing_email`. Proposal: the invoice
carries `billing_path` (`factored | direct`), defaulted from the broker's status
at build time and frozen. `not_approved` or `unknown` forces `direct` and shows
a blocking warning naming the status and its `factoring_status_reason`; staff can
proceed on the direct path but cannot submit to the factor. **Live consequence:
9 of 11 brokers are `unknown` today**, so on day one almost everything routes
direct until someone reviews them — the record already requires that review
before the first real load, and this makes the requirement visible instead of
silent.

Daily factor payout statements (wish-list "Factoring payout reconciliation")
become a `factoring_remittances` header with per-invoice payment rows, and
deposit confirmation stays a **separate** step (`reconciled_at`) — the wish-list
entry is explicit that the bookkeeper's bank confirmation is not the statement.

## 3. Supplemental invoices and the `-A1` path

**Split it, and say where the seam is.**

- **Module 5 owns the adjustment record.** `accessorial_adjustments` — the late
  line, its approval, its reference (`ST-1042-A1`), its pending queue. It exists
  whether or not an invoice was ever sent, and it feeds the *settlement* (the
  `adjustment` line kind already present in `settlementEngine.ts` as an enum
  member with no writer).
- **Module 7 owns the supplemental invoice.** Consuming an adjustment and
  billing the broker for it, only when the original was already sent.

Defence: `assert_charge_entry_allowed` (live body) refuses charge entry on
`invoiced/factored/paid/settled/closed` and its error text points at "the
adjustment path… land in a later settlement" — it names settlement, not
invoicing. An adjustment on a load billed direct and never factored still has to
reach a settlement. Putting the record in Module 7 would make settlement depend
on billing, which is backwards from the recorded module order (Module 7 needs
settled loads).

The `-A1` sequence is per load, allocated by a DB function with a unique
constraint on `(load_id, sequence)` — the same discipline the record demands of
load numbers, because these references reach the factor.

## 4. Payments and AR aging

`payments` posts many-to-one against an invoice: `invoice_id`, `amount`,
`received_at`, `method`, `source` (`factor | broker | other`), `reference`, and
for the factored path the fee/reserve/net split from §2. The invoice keeps a
derived `balance` = amount − Σ payments; `status` becomes
`open | partial | paid | short_paid | written_off`.

**Short-pay is a payment plus a reason, not a smaller invoice.** A short-pay
closes the balance only when someone records a `short_pay_reason` and an actor;
until then the invoice sits `partial` and ages. Rejected — silently adjusting the
invoice down: that erases the dispute, and the record already names short-pay
tracking (invoiced vs received, with reason) as Module 7 scope.

`ar_aging_snapshots`: a **daily** append-only row per (broker, bucket) capturing
open balance in 0–30 / 31–60 / 61–90 / 90+ by invoice age from `submitted_at`,
plus a count. It is a snapshot because aging is a point-in-time fact that cannot
be reconstructed later once invoices are paid — recomputing "what did 60+ look
like in March" from today's data is impossible. Rejected — computing aging on
demand only: fine for today's view, useless for the trend Module 9 needs.

## 5. What must not diverge

The invoice and the dispatch base read the same loads and must never disagree
about the *parts*, only about the *predicate*.

Concretely: **one shared parts assembler**. `src/lib/dispatchSettlement.ts`
already builds the header component from `rate_type`, `confirmed_tons` (never
estimated), unbundled FSC and `loadout_relocation_fee`. That assembly is
extracted into a shared pure function returning the itemised parts; the dispatch
engine then applies the 4.3 exclusion predicate to the charges, and the invoice
builder applies none. The exclusion predicate stays where it is — it is genuinely
dispatch-only.

This follows the mitigation already recorded in 4.7 (`carrierDateOf`, percentage
resolution, `deliveredInPeriod` extracted and called by both), and extends the
existing source guard: `src/test/shared-pay-percentage-source-guard.test.ts` has
a `CONSUMERS` list that refuses a literal `_pct` column name or a local
`new Date(` on a delivery value. The invoice builder joins that list. A second
guard asserts, over the six live delivered loads, that
`invoice_amount − Σ(excluded charges) = dispatch header+included parts` for the
same load — a single assertion that fails loudly if either side changes alone.

## 6. Tenancy

**`company_id` on every Module 7 table from the first migration**, NOT NULL, with
RLS scoped by it from day one.

The record is unambiguous: `company_id` is sequenced *after* Module 7 and before
cutover, precisely because "invoices and payments exist, which is the last major
shape the tenancy boundary must account for". Building these tables without it
guarantees they are in the retrofit — and the record already names the settlement
retrofit as a cost paid late, and separately records the lesson that "a caution
recorded and not applied gets more expensive with every pass". Adding a NOT NULL
column with a single default company to a table with zero rows is free. Adding it
to a table full of immutable, factored, paid invoices is not.

Rejected — waiting for the tenancy module: it saves nothing. The tenancy module
still has to write the RLS; it simply would also have to backfill and re-verify
immutable financial rows.

## 7. Build order and verification

| Pass | Content | Verified against |
|---|---|---|
| 1 | `invoices`, `invoice_line_items`, `invoice_batches`; `company_id`; RLS + GRANTs; immutability trigger once sent | grant-parity and definer guards already in the suite |
| 2 | Pure invoice builder from parts (no persistence) | the 6 live delivered loads and their 4 charges; the August dispatch settlement's stored per-load `header_component` figures (e.g. ST26059 6,750; ST26056 2,800 + 500 excluded detention) — the invoice must equal header + **all** charges |
| 3 | Persist + billing queue (`ready_to_invoice`, oldest first) + status transitions | 1 live `ready_to_invoice` load |
| 4 | `payments`, partial/short-pay, factoring timestamps, remittance ingest | **cannot be verified against real data** |
| 5 | `supplemental_invoices` consuming Module 5 adjustments | cannot be verified until Module 5 ships the adjustment record |
| 6 | `ar_aging_snapshots` + daily job | cannot be verified — needs aged invoices |

**What cannot be verified, stated plainly.** There is no factoring relationship
configured anywhere in the system (no Smart Freight Funding record, no factor
entity, no remittance format sample). There are no payments and no payment
history. Of 11 live brokers, 1 is `approved` and 9 are `unknown`, so the
factorable/direct branch cannot be exercised against real status data. Passes 4–6
are verifiable only against constructed fixtures, and that must be labelled as
fixture evidence, not seeded-data evidence, wherever it is recorded.

Also unresolved and blocking Pass 2's honesty: the recorded loadout charge defect
(`recompute_load_total_value` drops charges on loadouts) has a trigger reading
"before `total_load_value` is used for invoicing in Module 7". This proposal does
not use `total_load_value` for invoicing, so the trigger is not fired — but the
defect should be fixed in Pass 2 anyway, because the two figures will now be
visibly different on a loadout screen.

---

## CONTRADICTIONS

**None found.** Two things checked and cleared rather than reconciled: the
"nine brokers with `factoring_status = unknown`" entry matches live data (9 of
11 unknown; the other two are 1 `approved` and 1 other), and the two distinct 2%
figures — the factor's fee and `dispatch_settlement_rates.factoring_pct` — are
the same rate serving two different roles, which the record already states
(4.5), not a duplication.
