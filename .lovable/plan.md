# Cutover purge procedure — end-to-end re-read (report only, nothing changed)

Every claim below is from a live catalog query (`pg_constraint`, `pg_proc`,
`pg_trigger`, `information_schema`) or a live data query, marked CATALOG or DATA.

---

## 1. Does it still execute as one sequence?

| Step | Named constraint / trigger | Live status | Change |
|---|---|---|---|
| 0 snapshot | — | — | Object count moved: 27 named, live is 23 `load-documents` + 4 `rate-con-ingest` = 27 (DATA). Still correct. |
| 1 dispatch settlement | `dispatch_settlement_line_items.load_id`, `dispatch_settlement_load_contributions.load_id` both RESTRICT to `loads` (CATALOG, `confdeltype='r'`) | holds | **Its verify block names two tables that do not exist** — see §5. |
| 2 keep rates | none | holds | 1 row, unchanged (DATA) |
| 3 Pratt settlement | `enforce_settlement_immutability` BEFORE DELETE OR UPDATE, reads `settlement_writer_active()` = `current_setting('app.settlement_write')` (CATALOG) | holds | Its child `settlement_line_items` carries `enforce_settlement_line_immutability` BEFORE INSERT/DELETE/UPDATE, which fires on the CASCADE and needs the same unlock — same transaction, so fine, but it was never written down. |
| 4 storage | no FK from `storage.objects` | holds | unchanged |
| 5 loads | `loads` is the RESTRICT target of `invoices.load_id`, `accessorial_adjustments.load_id`, and both dispatch-settlement children (CATALOG) | **justification changed** | When written, `invoices` and `accessorial_adjustments` were empty. Live: 1 invoice, 2 adjustments (DATA). Step 5 now has two new blockers ahead of it. |
| 6 brokers / facilities | `invoices.broker_id`, `ar_aging_snapshots.broker_id` RESTRICT (CATALOG) | holds | invoice `ST26-0001` points at broker `46c4558f…`; it must go before Step 6 as well as before Step 5. |
| 7 Pate application | cascades | holds | unchanged |
| 8 resets | — | **incomplete** | `invoice_number_config` is not reset here (see §3). |

---

## 2. The three `SET LOCAL` unlocks

| Setting | Read by (CATALOG) | Protects | Needed today? |
|---|---|---|---|
| `app.accessorial_adjustment_write` | `accessorial_adjustment_writer_active()` | DELETE of an adjustment whose status is `approved` or `settled` | **YES** — `ST-TEST-005-A1` is `approved` (DATA) |
| `app.invoice_write` | `invoice_writer_active()` | DELETE of a SUBMITTED invoice, its lines; DELETE of ANY payment and ANY remittance (those two gates are unconditional, not submitted-dependent) | Not strictly — `ST26-0001` is `open`, `submitted_at` NULL, and `payments`/`factoring_remittances` are empty (DATA). Harmless to run. |
| `app.settlement_write` | `settlement_writer_active()` | DELETE of the `paid` Pratt settlement and, via CASCADE, its line items | **YES** |

**Correct order:** adjustments → invoices/payments/remittances → settlements →
loads. That is what the document states; the reason is FK direction, not the
unlocks themselves — `accessorial_adjustments.settlement_id` is RESTRICT to
`settlements` (CATALOG), so a settled adjustment would block Step 3.

**If one is skipped:** the adjustment unlock missing → `DELETE` of A1 raises
`42501` and Step 5 then fails `23503` on the load. The settlement unlock missing
→ Step 3 raises `42501`. The invoice unlock missing → nothing today, but the
moment a test invoice is submitted or a payment recorded, that block fails
`42501`. Each unlock is `SET LOCAL`, so it dies with its transaction — running
them in separate transactions from the deletes they authorise silently
un-protects nothing and the delete still fails.

---

## 3. New since 2026-09-03, and whether covered

| Added | Live (DATA) | Covered? |
|---|---|---|
| `invoices` | 1 — `ST26-0001`, `open`, `direct`, load `ST-TEST-005` | Yes, §1 Module 7 addendum + Pass 3 note |
| `invoice_line_items` | 1 | Yes (cascades) |
| `invoice_batches`, `payments`, `factoring_remittances`, `ar_aging_snapshots` | 0 | Yes |
| `invoice_number_config` | 1 row — `2026 / ST / next_sequence 2` | **Only in prose in the Module 7 Pass 3 record. NOT in Step 8's resets.** An operator running §3 top to bottom leaves it, and real invoicing starts at `ST26-0002`. |
| `accessorial_adjustments` | 2 — A1 `approved`, A2 `draft` | Yes, §1 Module 5 addendum |
| `audit_log` | inventory says 5; live is 11 for test entities: `load` 1, `settlements` 1, `dispatch_settlements` 3, `invoices` 1, `accessorial_adjustment` 5 | Partly — the count is stale. |
| Orphan audit row | 5 `accessorial_adjustment` rows across 3 distinct entity ids; `4f5f3bc7-…` has **no surviving adjustment** | **Not covered.** Purging audit by joining to `accessorial_adjustments` misses it; purge by `entity_type` instead. |
| `loads.ST-TEST-005` status | now `invoiced` | Noted in the Pass 3 record, not in §3's steps |
| Storage | no new objects: 23 + 4, as recorded | Yes |

---

## 4. Dependency graph around `ST-TEST-005` (`673e1887-…`)

Rows referencing it, with the FK delete rule (CATALOG):

```text
invoices.load_id                      RESTRICT   1 row  (ST26-0001)
  └ invoice_line_items.invoice_id     CASCADE    1 row
accessorial_adjustments.load_id       RESTRICT   2 rows (A1 approved, A2 draft)
settlement_withheld_loads.load_id     SET NULL   2 rows (both -> Pratt settlement)
load_documents / load_stops / load_charges /
load_status_history / load_change_history /
load_references / claim_flags(+history)  CASCADE
audit_log                             no FK      6 rows (1 invoices, 5 adjustment)
```

`accessorial_adjustments.settlement_id` is RESTRICT and both are NULL today, so
adjustments and the Pratt settlement are currently order-independent — that is
luck, not design.

**Required order:** adjustments (unlocked) → invoice → settlement (unlocked,
takes the withheld rows by cascade) → storage → load. The procedure's numbered
steps put settlements at 3 and loads at 5 but leave the adjustment and invoice
deletes in unnumbered §1 addenda; the adjustment addendum says it runs "before
Step 3's load deletes", and loads are **Step 5**, not Step 3.

---

## 5. Would it actually work

**No — two steps fail as written.**

1. **Step 1's verify block** queries `public.dispatch_settlement_contributions`
   and `public.dispatch_settlement_verdicts`. Neither exists (CATALOG). The live
   names are `dispatch_settlement_load_contributions` and
   `dispatch_settlement_charge_verdicts`. Both queries raise `42P01`.
2. **Step 5 (`DELETE FROM public.loads`)** fails `23503` for an operator working
   the numbered steps in order, because the invoice and adjustment deletes are
   not numbered steps — they sit in §1 addenda ahead of the step list.

Everything else would run: the three unlock reads match the live function
bodies verbatim, every RESTRICT the procedure names is live, and no cascade it
relies on has changed.

---

## 6. What cannot be verified without running it

Still true for **Step 3** — the harness role holds SELECT/INSERT only, so the
`paid`-settlement delete under `app.settlement_write` can only be proven by
running it inside a transaction and reading the row count before COMMIT.

**Three joined it since:**
- The `approved`-adjustment delete under `app.accessorial_adjustment_write`.
- The invoice-line cascade under `app.invoice_write` (the UPDATE/DELETE halves
  of that trigger have never been exercised from this harness — recorded in the
  Module 7 Pass 1 test note).
- **Step 4**, storage deletion — outside Postgres entirely; no catalog can
  confirm the objects are gone.

---

## VERDICT

**EXECUTABLE WITH NAMED CORRECTIONS.** Four, none of them structural:

1. Step 1's verify block names two non-existent tables (`42P01`).
2. The adjustment and invoice deletes must become numbered steps ahead of
   Step 5, and the "before Step 3's load deletes" wording must read Step 5.
3. Step 8 must reset or delete `invoice_number_config` (live `next_sequence 2`).
4. The audit inventory must read 11, purged by `entity_type` — one
   `accessorial_adjustment` audit row has no surviving adjustment.
