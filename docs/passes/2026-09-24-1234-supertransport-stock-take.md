# Pass report — 2026-09-24 12:34 UTC — SUPERTRANSPORT stock take

## Scope
Docs only: docs/tms-build-status.md, docs/tms-wish-list.md, roadmap.md, this report. No migration, code or data. **Full suite skipped (docs only).** Prompt received complete, ending with the END OF PROMPT line.

## Step 1 — recorded
P48 recorded verbatim in docs/tms-build-status.md, with the three habits added as a standing rule. Wish list: new heading "Before any second carrier shares the database" — (1) definer-function audit incl. get_pei_queue, FIRST; (2) demo stage 5; (3) demo stage 6. Noted: `get_pei_queue()` returns every carrier's PEI requests (live body contains no `company_id` predicate) and must be scoped before a second carrier exists.

## Step 2 — the draft session (read only, nothing fixed)
0060 is `drizzle/migrations/0060_pei_request_attribution_and_withdraw.sql`. Live EXECUTE grants on its SECURITY DEFINER functions:

| Function | PUBLIC | anon | authenticated | Verdict |
|---|---|---|---|---|
| log_pei_request_audit() (trigger) | yes | yes | yes | **owed** — revoke PUBLIC, anon, authenticated |
| refuse_pei_request_delete() (trigger) | yes | yes | yes | **owed** — revoke PUBLIC, anon, authenticated |
| update_application_pei_status() | no | no | no | complies |
| get_pei_queue() | no | no | yes (app calls it) | grants comply; **company filter owed** (habit 3) |

Full suite since the merge: **not run.** The last full run is the stage 4 part 2b pass (2026-09-23 21:20); the draft's own PEI report (2026-09-23-1330) records a run inside the draft (`Tests 6 failed | 2206 passed | 16 skipped (2228)`), which predates the merge onto main. Birthday messages and invite-truck-owner: not reviewed for suite coverage since merge.

Owed: two REVOKE statements; get_pei_queue company scoping; one full suite on main after the merge.

## Step 3 — stock take (live counts 2026-09-24; exact where stated)

| Area | Staff can do today, end to end | In DB, no screen/writer | Missing | Real data |
|---|---|---|---|---|
| Load entry & management | Create, edit, assign driver, move status, cancel/TONU on Loads list + detail | load_status_history rows not being written in practice (0) | — | 18 loads (8 in last 30 days); 4 stops, 4 charges |
| Rate-con parsing | Upload or email a rate con, AI pre-fills Create Load, inbox + diagnostics | — | — | ingest queue 0; little real use |
| Dispatch board | Daily status board, search, needs-attention filter, day logs | Board is status-driven, not load-driven | Load-aware board | 81 active_dispatch; 6,181 day-log rows (1,092 last 30 days) — heavy daily use |
| Driver app | Documents, uploads, messages, ICA signing, pay setup, stop check-in screen | Check-ins exist in code; little data | Load list polish, settlement view with real data | 856 vault docs, 1,195 operator docs; 5 messages |
| Accessorials & detention | Enter charges by hand; late-accessorial queue | detention_claims (0), claim_flags (1) | Automatic detention clock | 2 adjustments, 0 detention claims |
| Fuel import & deductions | Import a fuel file, exceptions, per-driver, locations | deductions/installments, cash advances, R&M deposits (all 0) | Deduction writer in daily use | 69 transactions, 1 import batch |
| Driver settlements | Settlement run, review, rate mismatch warning, settings | settlement_line_items 0 | Regular weekly use | 1 settlement (paid) |
| Dispatch company settlement | Screen exists | dispatch_settlement_rates 0 | Rates set for SUPERTRANSPORT | 1 dispatch settlement |
| Invoicing & factoring | Billing queue, invoice build | factoring remittances 0, broker factoring history 0 | Factoring submission/remittance flow | 1 invoice (open), 1 line |
| Payments & AR | — | payments, ar_aging_snapshots (0) | Payment entry screen, AR aging | 0 |
| Brokers | Broker directory, factoring status | broker_documents 0 | — | 13 brokers; facilities 0 |
| Compliance & documents | Expiry monitoring, reminders, inspection binder/share, inspections | — | — | 56 cert reminders, 6 DOT inspections, 219 equipment items |
| Onboarding | Apply, pipeline, PEI, ICA, pay setup, go-live, deactivation | — | — | 350 applications (36 last 30 days), 159 operators (58 active), 147 PEI, 3 ICAs |
| Reporting | Forecasts, management metrics | overhead, revenue targets, scenarios (unused) | Financial Intelligence reports | 26 forecast loads |

Counts for loads, load_charges, pay_policies (1), settlements, invoices, payments, fuel, brokers, detention, claim_flags, dispatch_settlements and applications/operators activity are exact `count(*)`; others are table statistics estimates.

**Reading:** onboarding, compliance and the daily dispatch board are in real use. The revenue layer (loads → settlement → invoice → payment) is built but carries test-sized data only; payments/AR is not started.

## Step 4
roadmap.md rewritten into Built and in use / Built, not yet used / Partly built / Not started, each item pointing to its record. The old stale "Next" items and done-logs removed.

## Files authored
- docs/tms-build-status.md (P48 + standing rule, appended)
- docs/tms-wish-list.md (new heading; stage 5 marked paused)
- roadmap.md (rewritten)
- docs/passes/2026-09-24-1234-supertransport-stock-take.md

## Contradictions
None with the prompt. Commits are saved automatically; no git commands run.
