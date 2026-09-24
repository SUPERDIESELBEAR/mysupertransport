# Pass report — 2026-09-24 12:42 UTC — SUPERTRANSPORT stock take, Alvys cutover as the measure

## Scope
Docs only: docs/tms-build-status.md, docs/tms-wish-list.md, roadmap.md, this report. No migration, code or data. **Full suite skipped (docs only).** Prompt received complete, ending with the END OF PROMPT line. This report supersedes 2026-09-24-1234-supertransport-stock-take.md (left unaltered, per the one-file-per-pass rule).

## Step 1 — recorded
- P48 verbatim + standing rule "The three tenancy habits" (build-status, 12:34 entry).
- P49 verbatim (build-status, 12:42 entry).
- Wish list: "Before any second carrier shares the database" — (1) definer-function audit, get_pei_queue FIRST (returns every carrier's PEI requests; live body has no company_id predicate); (2) demo stage 5; (3) demo stage 6. Demo carrier PAUSED.

## Step 2 — draft session (read only, not fixed)
0060 = drizzle/migrations/0060_pei_request_attribution_and_withdraw.sql. Live EXECUTE:

| Function | PUBLIC | anon | authenticated | Verdict |
|---|---|---|---|---|
| log_pei_request_audit() (trigger) | yes | yes | yes | **owed** — revoke all three |
| refuse_pei_request_delete() (trigger) | yes | yes | yes | **owed** — revoke all three |
| update_application_pei_status() | no | no | no | complies |
| get_pei_queue() | no | no | yes (app caller) | grants comply; **company filter owed** |

Full suite since the merge: **not run** on main. Last full run: stage 4 part 2b (2026-09-23 21:20). The draft's own run (`Tests 6 failed | 2206 passed | 16 skipped (2228)`) predates the merge.

Owed: two REVOKEs; get_pei_queue scoping; one full suite after the merge.

## Step 3 — stock take (live, 2026-09-24)

| Area | Staff can do end to end | In DB, no screen/writer | Missing | Real data |
|---|---|---|---|---|
| Load entry & management | Create, edit, assign driver, status, cancel/TONU | load_status_history not written in practice | — | 18 loads (8 last 30 days); 4 stops, 4 charges |
| Rate-con parsing | Upload/email a rate con; AI pre-fills Create Load; inbox, diagnostics | — | — | ingest queue 0 |
| Dispatch board | Daily status board, search, attention filter, day logs | — | Load-aware board | 81 active_dispatch; 6,181 day-log rows (1,092 last 30 days) |
| Driver app | Documents, uploads, messages, ICA, pay setup, My Settlements, forecast, stop check-in | — | Real settlement data to show | 856 vault docs, 1,195 operator docs |
| Accessorials & detention | Hand-entered charges; late-accessorial queue | detention_claims 0, claim_flags 1 | Detention clock | 2 adjustments |
| Fuel import & deductions | Fuel import, exceptions, per-driver, locations | deductions/installments 0; cash_advances (no screen); rm_deposits 0 | Staff deduction/advance entry in use | 69 transactions, 1 batch |
| Driver settlements | Settlement run, review, mismatch warning, settings | settlement_line_items 0 | Weekly use | 1 settlement (paid) |
| Dispatch co. settlement | Screen exists | dispatch_settlement_rates 0 | SUPERTRANSPORT rates | 1 |
| Invoicing & factoring | Billing queue, invoice build | factoring_remittances 0, broker_factoring_history 0 | Factoring submission & remittance | 1 invoice (open) |
| Payments & AR | — | payments 0, ar_aging_snapshots 0 | Payment posting screen, aging | 0 |
| Brokers | Directory, factoring status | broker_documents 0; facilities 0 | — | 13 brokers |
| Compliance & documents | Expiry monitoring, reminders, binder share, inspections | — | — | 56 reminders, 6 DOT inspections, 219 equipment |
| Onboarding | Apply → pipeline → PEI → ICA → pay setup → go-live → deactivation | — | — | 350 apps (36 last 30 days), 159 operators (58 active), 147 PEI |
| Reporting | Forecasts, management metrics | overhead/targets/scenarios unused | Financial Intelligence | 26 forecast loads |

Exact count(*): loads, load_charges, pay_policies (1), settlements, invoices, payments, fuel, brokers, detention, claim_flags, dispatch_settlements, recent apps/logs; other figures are table-statistics estimates.

## Step 4 — Alvys cutover list

### Milestone 1 — load tracking
| Item | State | Blocks cutover? |
|---|---|---|
| Create/update a load | Done | — |
| Stops, sequence, appointments | Done | — |
| Statuses & transitions | Done; status history not recorded (0 rows) | **Blocks** — audit trail of who moved a load |
| Rate cons (upload, email, AI parse, revised re-parse) | Done | — |
| Load documents (BOL/POD, exceptions) | Done; exceptions untested in use (0) | — |
| Driver sees and checks in on loads | Partly — check-in screen exists, unproven in use | **Blocks** if drivers update status in Alvys today (owner Q1) |
| Load-aware dispatch board | Not built | Nice-to-have (status board works) |
| Customer tracking links | Not built | Nice-to-have unless brokers get Alvys links (Q2) |
| Real volume | 18 loads total | **Blocks** — a parallel run week is owed |

### Milestone 2 — invoicing
| Item | State | Blocks? |
|---|---|---|
| Build invoice from a load (parts assembler) | Done | — |
| Invoice document sent to broker/factor | Partly — code cannot confirm a sendable invoice PDF/email is in use | **Blocks** (Q3) |
| Factoring submission to Smart Freight Funding | Not built | **Blocks** |
| Factoring payment received (settlement trigger) | Not built (factoring_remittances 0) | **Blocks** — settlement eligibility depends on it |
| Direct-bill payment posting | Not built (no screen) | **Blocks** |
| Supplemental invoices (-A1) | Partly — adjustments exist, supplemental send unproven | Nice-to-have for day one |
| AR aging | Not built | Nice-to-have (factor holds most AR) |

### Milestone 3 — operator settlements
| Item | State | Blocks? |
|---|---|---|
| Weekly settlement run & review | Done; 1 real settlement | — |
| Pay %, per-driver rates, mismatch flag | Done | — |
| Fuel import & deduction | Partly — 1 import batch; deduction onto settlement unproven | **Blocks** until a real week reconciles |
| Recurring deductions / installments | Partly — tables, no staff screen in use (0) | **Blocks** (Q4) |
| R&M Deposit | Partly — table, 0 rows, no running balance | **Blocks** if Alvys tracks it today (Q5) |
| Cash advances | Not built (table only, no screen) | **Blocks** if advances are given (Q6) |
| Statements to drivers | Partly — My Settlements shows them; no emailed/PDF statement | Nice-to-have unless Alvys emails statements (Q7) |
| Payout | Not built in SUPERDRIVE (payroll via Everee per onboarding records) | Needs answer (Q8) |
| HOLD claims skip settlement | Done | — |

### Questions the owner must answer (code cannot tell)
1. Do drivers update load status/documents in the Alvys driver app today?
2. Do brokers or shippers receive Alvys tracking links?
3. How does an invoice reach the factor/broker from Alvys — PDF by email, portal upload, or an integration?
4. Which recurring deductions (insurance, ELD, plates, etc.) run through Alvys each week?
5. Is the R&M Deposit balance kept in Alvys, or elsewhere?
6. Are cash advances issued, and recorded in Alvys?
7. Do drivers get a settlement statement from Alvys (email/PDF)?
8. Does Alvys push payouts, or does Everee/the bank do it from an Alvys export?
9. What Alvys history (loads, open invoices, R&M balances, carried-forward negatives) must be brought over at cutover?

## Step 5
roadmap.md rewritten: three Alvys milestones first (remaining items in order), then Built and in use / Built, not yet used / Partly built / Not started.

## Files authored
- docs/tms-build-status.md (P48 + standing rule; P49 entry)
- docs/tms-wish-list.md (new heading, audit first; stage 5 paused)
- roadmap.md (rewritten)
- docs/passes/2026-09-24-1234-supertransport-stock-take.md (earlier version)
- docs/passes/2026-09-24-1242-supertransport-stock-take.md (this report)

## Contradictions
None. Commits save automatically; no git commands run.
