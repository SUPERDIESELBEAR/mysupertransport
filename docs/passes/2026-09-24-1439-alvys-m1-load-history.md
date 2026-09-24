# Pass report — 2026-09-24 14:39 UTC — Alvys milestone 1, pass 1: load status history, driver side, five scheduled functions

## Scope
Prompt received complete, ending with the END OF PROMPT line. Nothing in it contradicted the live system except one premise in Step 2, reported below rather than stopped on because the step itself asks for it to be surfaced: **a driver cannot move a load's status from the app** (no such path exists), so the "moved by its driver" half of the Step 2 proof cannot happen.

Migrations: `0061_load_status_history_source_and_person.sql`, `0062_load_docs_operator_upload_own.sql`. Functions changed and deployed: send-birthday-anniversary, notify-pwa-install, cron-cert-reminders, send-unread-message-reminders, pei-auto-cadence (+ new `_shared/cronAuth.ts`). Screen: load page Status History labels.

## Step 0 — the stock take corrected (exact count(*), 2026-09-24 ~14:35 UTC)
Rule recorded: **a stock take uses exact counts only.** The 1242 report is left unaltered; this is the correction.

| Figure (1242 report) | Estimate | Exact | Changes the conclusion? |
|---|---|---|---|
| load_status_history | 0 | **16** (13 of 18 loads) | **Yes** — "not written in practice" was wrong; it has always been written |
| load_stops | 4 | **37** | Yes — stops are in real use, not 4 |
| load_documents | (not given) | **25** | Yes — paperwork is being filed |
| stops with a driver check-in | (not given) | 1 | No — check-ins are still barely used |
| rate_con_ingest_queue | 0 | **5** | Yes — rate-con intake has been used |
| messages | 5 | **19** | Minor |
| settlement_line_items | 0 | **1** | Minor (matches the 1 settlement) |
| dispatch_settlement_rates | 0 | **1** (SUPERTRANSPORT, effective 2026-01-01) | **Yes** — "no SUPERTRANSPORT rates" was wrong |
| facilities | 0 | **2** | Minor |
| truck_dot_inspections | 6 | **109** | **Yes** — inspections are heavily used |
| ica_contracts | 3 | **66** | **Yes** — ICAs are in real use |
| forecast_loads | 26 | **290** | **Yes** — forecasting is used |
| equipment_items | 219 | 220 | No |
| active_dispatch | 81 | 81 | No |
| dispatch_daily_log (all / 30 days) | 6,181 / 1,092 | 6,195 / 1,097 | No (grew during the day) |
| driver_vault_documents | 856 | 856 | No |
| operator_documents | 1,195 | 1,195 | No |
| cert_reminders | 56 | 56 | No |
| pei_requests | 147 | 147 | No |
| accessorial_adjustments | 2 | 2 | No |
| deductions, deduction_installments, cash_advances, rm_deposits, rm_deposit_transactions, dispatch_deductions | 0 | 0 | No |
| factoring_remittances, broker_factoring_history, ar_aging_snapshots, broker_documents, document_exceptions | 0 | 0 | No |
| fuel_import_batches / invoice_line_items / load_charges | 1 / 1 / 4 | 1 / 1 / 4 | No |

Corrected conclusions (also in roadmap and build record): load status history exists and is written by one trigger; dispatch company settlement has SUPERTRANSPORT rates; DOT inspections, ICAs and forecasts are in real use.

## Step 1 — P50–P56 recorded verbatim (build record). Roadmap milestones rewritten in the owner's order.

## Step 2 — load status history: the existing trigger, fixed
- **One writer kept:** `trg_loads_log_status_change` (AFTER UPDATE, WHEN status changes) → `log_load_status_change()`. No second writer.
- **Source, how the trigger learns it:** (1) a transaction-local setting `superdrive.status_change_source` (`staff_screen` / `driver_app` / `system`) set by any path that knows it — `update_load_status` (the status buttons) now sets `staff_screen` before its update instead of overwriting afterwards; (2) when the change does not come through the buttons and nobody is signed in (cron, service role, migrations) → `system`; (3) otherwise from the signed-in caller's roles: staff → `staff_screen`, operator → `driver_app`. An unknown value is refused (22023).
- **Person:** `current_profile_id()` whenever someone is signed in; empty only for `system`.
- `assign_load_driver`'s auto-cover still relabels its row `auto_assignment` (shown as "System, on driver assignment"), person = the dispatcher.
- **After 4 September:** 0 history rows after 2026-09-05, and no load changed status after 4 September. Every load whose status moved has a matching last history row. Five loads have no history: ST26003, ST26015, ST26064, ST26069 (all still `available`, never moved) and ST-TEST-003 (`delivered`, created 2026-08-19 15:15 with the other test fixtures — inserted directly at that status; an insert is not a status change, so no bypass of the trigger).
- **Older entries:** 5 rows have no source and no person (Aug 19–29); 10 are `manual_ui`, 1 `auto_assignment`. Not backfilled. The load page now shows "recorded without a source" for the 5; `manual_ui` shows as "Staff screen" (it was only ever written by the status buttons — a rename, not a guess).
- **Proof (raising transaction, throwaway load PROOF-0061 for the demo driver):**
  ```
  covered -> dispatched     | staff_screen | Leo Wallace   (status button)
  dispatched -> in_transit  | staff_screen | Leo Wallace   (status button)
  in_transit -> at_delivery | staff_screen | Leo Wallace   (direct write, not the buttons)
  at_delivery -> delivered  | system       | (no person)   (no one signed in)
  driver status write:  REFUSED Operators may only update driver action fields on their loads
  driver status button: REFUSED You do not have permission to change load status
  ```
  **Driver half not provable:** drivers have no way to move a load's status (listed in the wish list). The `driver_app` branch exists for when one is added. Residue: 0 PROOF loads.

## Step 3 — the driver side (throwaway load, demo driver)
| Action | Result |
|---|---|
| Driver sees the load and its 2 stops | Works |
| Check-in at pickup and delivery (arrival + departure) | Works (1 row each) |
| Upload BOL and POD — the **file** | **Broken, fixed.** The load-documents storage folder admitted staff uploads only, so every driver upload failed at the file step before its record was written. 0062 admits a driver's upload only into the folder of a load assigned to him. Re-proved: both files accepted; upload into a load not his refused. |
| Upload BOL and POD — the **records** | Works (`upload_channel = driver_app`) |
| Staff see both documents on the load | Works (records and files) |
| Driver moves the load's status | **Not possible** — larger item, listed, not fixed |

Proved at the database level with the driver's identity; the phone screens themselves were not clicked through in this pass. Residue: 0.

## Step 4 — the five scheduled functions
cron.job: all five already send `x-cron-secret` (send-birthday-anniversary-daily, daily-pwa-install-reminder, cron-cert-reminders-daily, send-unread-message-reminders, pei-auto-cadence-hourly). None needed fixing.

Refusal with the publishable key and no secret (live, after deploy), and with a wrong secret:
```
send-birthday-anniversary:     403 {"error":"Forbidden: scheduled function"}
notify-pwa-install:            401 {"error":"Unauthorized"}
cron-cert-reminders:           403 {"error":"Forbidden: scheduled function"}
send-unread-message-reminders: 403 {"error":"Forbidden: scheduled function"}
pei-auto-cadence:              403 {"error":"Forbidden: scheduled function"}
```
Staff call to notify-pwa-install (signed in as marc@mysupertransport.com): `200 {"success":true,"notified":0,"skipped":0}`. A real send was avoided by targeting an operator id that does not exist (all zeros), so the gate admitted the call and the function found nobody to notify. A non-staff session is refused 403 by the role check (by code; not called live).

Scheduled runs not triggered by hand. Next runs (UTC): pei-auto-cadence 2026-09-24 15:00 (hourly); cron-cert-reminders, send-birthday-anniversary, send-unread-message-reminders 2026-09-24 15:00; notify-pwa-install 2026-09-25 14:00 (today's 14:00 run was before the deploy). **Each must be read from net._http_response afterwards (retention ~6 h).** None ran during the pass.

## Step 5 — draft-merge leftovers
EXECUTE revoked from PUBLIC, anon, authenticated on `log_pei_request_audit()` and `refuse_pei_request_delete()` (and on `log_load_status_change()`). Live ACL now: postgres, service_role only. `get_pei_queue` company filter confirmed recorded under "Before any second carrier shares the database", item 1; not fixed.

## Tests
New: `src/test/scheduled-function-gate.test.ts`. Full suite (--maxWorkers=2) and typecheck: see the end of this report.

## Files authored
- drizzle/migrations/0061_load_status_history_source_and_person.sql
- drizzle/migrations/0062_load_docs_operator_upload_own.sql
- supabase/functions/_shared/cronAuth.ts
- supabase/functions/{send-birthday-anniversary,notify-pwa-install,cron-cert-reminders,send-unread-message-reminders,pei-auto-cadence}/index.ts
- src/components/dispatch/loadDetail/StatusHistoryCard.tsx
- src/test/scheduled-function-gate.test.ts
- docs/tms-build-status.md, docs/tms-wish-list.md, roadmap.md
- docs/passes/2026-09-24-1439-alvys-m1-load-history.md (this report)

## Contradictions
One: the Step 2 driver proof assumes a driver can move status; none can. Reported, not worked around. Commits save automatically; no git commands run.
