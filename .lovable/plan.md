# Cutover Purge Procedure — written before the day, executed on the day

Read-only investigation. Nothing was deleted. Every fact below was confirmed by a
live query today (2026-09-03) or by reading the live catalog.

## Headline findings

1. **The whole `loads` table is test data.** All 16 rows. The recorded purge list
   names 11 (six ST260xx + five ST-TEST-00x). It **misses five**: `ST26003`,
   `ST26015`, `ST26033`, `ST26034`, `ST26035`. Two are `cancelled`, one is
   `covered` and assigned to a real operator (`71221960…`), which is exactly the
   row most likely to be mistaken for real work on the day.
2. **The Pratt settlement is `paid` and CANNOT be deleted by an ordinary DELETE.**
   `enforce_settlement_immutability` raises `42501` on DELETE when
   `status = 'paid'` unless `settlement_writer_active()` is true. That function
   reads `current_setting('app.settlement_write')`. So there **is** a documented
   route — `SET LOCAL app.settlement_write = 'on'` in the same transaction — and
   it is not a trigger disable. It is the intended unlock. Flagged for an explicit
   decision anyway, because it is the one step that destroys a `paid` money row.
3. **The demo environment shares this database and has no revenue-layer isolation.**
   `is_demo` exists on 10 tables — `operators`, `applications`, `profiles` and
   seven ELD tables. It does **not** exist on `loads`, `load_documents`,
   `brokers`, `settlements`, `dispatch_settlements`, `fuel_transactions`,
   `deductions` or any settlement child. There is exactly **one** demo operator
   ("ELD Test Harness"), one pay policy, one settlement-settings row, one dispatch
   rate row — all shared. **Post-cutover testing of loads, settlements, fuel or
   billing would write to the same production tables the purge just cleaned.**
   This is the item that determines whether cutover as described is possible.

## 1. Inventory — what must go

Confirmed live counts. Rows marked NEW were not on the recorded list.

| Object | Count | Note |
|---|---|---|
| `loads` | 16 | all test; five NEW (ST26003, ST26015, ST26033/34/35) |
| `load_stops` | 33 | cascades from loads |
| `load_documents` | 23 | cascades; 23 objects in `load-documents` bucket do NOT |
| `load_charges` | 4 | ST26056 detention, ST26063 lumper, ST26061 tonu, ST26063 tonu |
| `load_references` / `load_reference_citations` | 13 / 7 | cascade |
| `load_change_history` / `load_status_history` | 45 / 15 | cascade |
| `claim_flags` / `claim_flag_history` | 1 / 1 | the HOLD on ST-TEST-005; cascades |
| `detention_claims`, `document_exceptions` | 0 / 0 | nothing to do |
| `settlements` | 1 | Pratt, 2026-08-12→08-18, payday 2026-09-01, `paid`, 327.94 |
| `settlement_line_items` | 1 | `load_pay 327.94`, cascades from settlement |
| `settlement_withheld_loads` | 2 | NEW as an explicit item; cascades from settlement |
| `dispatch_settlements` | 1 | 2026-08-01, `draft` |
| `dispatch_settlement_line_items` / `contributions` / `verdicts` | 9 / 7 / 3 | cascade |
| `dispatch_settlement_rates` | 1 | the unconfirmed `effective_from 2026-01-01` row |
| `brokers` | 11 | 2 clearly test, 9 real names from real rate cons (see §3) |
| `facilities` | 2 | NEW — "J M Exotic Foods", "Braswell's", from seed rate cons |
| `rate_con_ingest_queue` | 5 | NEW — 3 hold storage paths under `rate-con-ingest` |
| `parser_diagnostics` | 74 | NEW — largest missed table; FKs are SET NULL, so it survives a load delete silently |
| `audit_log` | 5 | NEW — `load`, `settlements`, `dispatch_settlements` entities |
| storage `load-documents` | 23 objects | NEW — no FK, orphaned by any delete |
| storage `rate-con-ingest` | 4 objects | NEW |
| `preview_sessions` | 112 | NEW — mobile-preview handoff rows |
| `load_number_config` | `ST next=64` | reset to 1 |
| Craig Pate application | 1 | `08066a41…`, `revisions_requested`, 1 resume token, 0 document-history rows, **1 operator row references it** |

Empty and needing nothing: `fuel_transactions`, `fuel_import_batches`,
`deductions`, `deduction_installments`, `rm_deposits`, `cash_advances`,
`dispatch_deductions`, `pay_policy_assignments`, `dispatch_settlement_rates_history`.

**What the recorded list was missing, in one line:** five loads, all storage
objects, `parser_diagnostics` (74), `rate_con_ingest_queue` (5), `facilities` (2),
`audit_log` (5), `settlement_withheld_loads` (2), `preview_sessions` (112), and the
fact that the seed brokers are real companies.

## 2. The order, and why each step sits where it does

Run each step in its own transaction. Verify before moving on.

**Step 0 — snapshot.** Full database backup plus a manifest of the 27 storage
objects (23 + 4). Steps 4, 5 and 6 are irreversible.

**Step 1 — delete the dispatch settlement (2026-08-01, `draft`).**
`DELETE FROM dispatch_settlements WHERE period_month = '2026-08-01'`.
*Why first:* `dispatch_settlement_line_items.load_id` and
`…_load_contributions.load_id` are **ON DELETE RESTRICT** to `loads`. While those
rows exist, seven of the loads cannot be deleted at all. The settlement is `draft`,
so `enforce_dispatch_settlement_immutability` does not fire the paid branch and no
`SET LOCAL` unlock is needed. Children cascade on `dispatch_settlement_id`.
*Verify:* all four dispatch tables count 0.

**Step 2 — decide and act on `dispatch_settlement_rates`.** Either confirm
2026-01-01 as the real effective date and keep the row, or delete and insert the
real one. *Why here:* no FK forces it, but it must be settled before any real month
is computed, and this is the last moment it is unambiguously test-adjacent.

**Step 3 — delete the Pratt settlement. THE DECISION STEP.**
It is `paid`. `enforce_settlement_immutability` raises `42501` on DELETE unless
`settlement_writer_active()` returns true, which reads
`current_setting('app.settlement_write')`. The only route is:

```
BEGIN;
SET LOCAL app.settlement_write = 'on';
DELETE FROM public.settlements WHERE id = 'f77911b0-50cd-4ae3-bff2-ebb0bc4331af';
COMMIT;
```

This is the mechanism the schema provides, not a trigger disable — no
`ALTER TABLE … DISABLE TRIGGER` is proposed. It still needs a named human decision
because it deletes a `paid` money row, and because the same unlock in a careless
hand would delete a real one. **Recommendation: run it as a single-row DELETE by
literal id, never by predicate.**
*Why before the loads:* `settlement_withheld_loads.load_id` is SET NULL and
`settlement_line_items` has no `load_id`, so this does not strictly block the load
delete — but doing it after would leave a settlement whose withheld rows silently
nulled their load reference, which is unauditable. Order it here.
*Verify:* `settlements`, `settlement_line_items`, `settlement_withheld_loads` all 0.

**Step 4 — delete storage objects BEFORE the rows that name them.**
23 objects in `load-documents`, 4 in `rate-con-ingest`. There is no FK from
`storage.objects` to `load_documents`; deleting the load first destroys the only
record of which object belonged to it. *Verify:* both buckets 0 for the recorded
prefixes; the other 19 buckets untouched.

**Step 5 — null the SET NULL referrers explicitly, then delete the loads.**
`parser_diagnostics.load_id/document_id`, `rate_con_ingest_queue.matched_load_id/
converted_load_id` and `messages.load_id` are all **ON DELETE SET NULL** — they
survive a load delete as orphans that look like real diagnostics. Delete
`parser_diagnostics` (74) and `rate_con_ingest_queue` (5) outright first
(`messages.load_id` count is 0, nothing to do), then:
`DELETE FROM public.loads` — the whole table, since all 16 rows are test.
Cascades take stops, documents, charges, references, citations, both histories,
claim flags and claim-flag history.
*Verify:* `loads` 0 and each of the ten cascade tables 0.

**Step 6 — brokers and facilities.** Delete the two `TEST-1000xx` brokers
unconditionally. The other nine are real companies (§3) — decision, not deletion.
Delete the two facilities. Broker children cascade.

**Step 7 — Craig Pate's application.** `application_resume_tokens`,
`application_document_history`, `application_correction_requests` and
`application_revision_attachments` all cascade. **But one `operators` row carries
`application_id = 08066a41…`** and that FK is not a cascade — resolve that operator
row first (delete if it is the test operator, null the link if not).
*Verify:* the application and its 1 resume token are gone; `operators` count is
unchanged at 154 minus whatever was deliberately removed.

**Step 8 — resets.** `load_number_config.next_sequence = 1`. Clear
`preview_sessions` (112). *Why last:* nothing depends on them, and resetting the
sequence earlier would let a mid-purge load creation collide.

## 3. What must not be deleted, and how each step is scoped

- **The 60 active operators** (154 total rows, 60 `is_active`, 1 demo). No step
  deletes from `operators` except the single Pate-linked row in Step 7, addressed
  by literal id. **Note: the ST-TEST loads and the Pratt settlement both point at
  `f2051752…`, who is a REAL active non-demo operator.** Deleting "the operator
  that owns the test loads" would delete a live driver. Never delete by joining
  through loads.
- **326 real applications.** Step 7 touches one literal id.
- **Real ELD, compliance, equipment, inspection, vault data.** No step reaches
  those tables; the ELD demo operator is the only `is_demo` operator and is
  unaffected.
- **19 storage buckets besides `load-documents` and `rate-con-ingest`.** Step 4
  names bucket ids explicitly, never a wildcard.

**Hard to distinguish — say so now, decide before the day:** the nine non-TEST
brokers (Integrity Express, Cahaba, Blue Grace, Globaltranz, ITS National, Eclipse
Transervices, Rolling River, Fide Freight, Nationwide) are **real companies whose
real rate confirmations were used as test input**. The rows are legitimate trading
partners with a test provenance. They are not distinguishable by any column —
`factoring_status` is `unknown` on all nine. Proposal: keep them, review each
factoring status manually before the first real load, and record the review. Do not
try to separate them with a query.

## 4. The demo environment — finding

**It exists, it shares this database, and it does not cover the revenue layer.**

- Demo mode is a `sessionStorage` flag (`useDemoMode`) that blocks writes in the UI
  and a `show_demo_accounts` visibility toggle. It is a client-side guard, not an
  environment.
- Demo isolation at the data layer is the `is_demo` column, present on 10 tables:
  `operators`, `applications`, `profiles`, and seven ELD tables. One demo operator
  exists.
- `is_demo` is **absent** from `loads`, `load_stops`, `load_documents`, `brokers`,
  `facilities`, `settlements`, `dispatch_settlements`, `fuel_transactions`,
  `deductions`, `cash_advances`, `rm_deposits` and every settlement child.
- There is one `pay_policies` row, one `settlement_settings` row and one
  `dispatch_settlement_rates` row — shared, not per-environment.

**Therefore: testing a load, a settlement, a fuel import or an invoice "in demo"
after cutover writes to the same production tables and, for settlements, into the
same immutability regime.** The cutover cleans the tables; it does not stop them
being dirtied again the same way. Either the revenue tables gain a demo flag with
RLS and UI filtering before cutover, or post-cutover revenue testing needs a
separate project. This is a prerequisite, not a follow-up.

## 5. Verification and reversibility

Per-step verification is named inline above; each is a `count(*)` on the target
plus a `count(*)` on the neighbouring real table that must not move (`operators`
154, `applications` 327 before Step 7, the other 19 buckets).

Irreversible without the Step 0 backup: **Step 3** (a `paid` settlement, gone),
**Step 4** (storage objects — object bytes are not in a Postgres backup; the
manifest and a download are the only recovery), **Step 5** (45 change-history and
15 status-history rows that cannot be reconstructed).

Cannot be verified before running: **Step 3**. The trigger either accepts the
`SET LOCAL` unlock or raises `42501`, and the only way to find out is to run it.
Run it inside an explicit transaction and inspect the row count before `COMMIT`.
