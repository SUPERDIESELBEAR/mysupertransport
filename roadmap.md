# Roadmap (rewritten 2026-09-24 from the live system — see docs/passes/2026-09-24-1234-supertransport-stock-take.md)

Direction: P48 — SUPERTRANSPORT first; demo carrier PAUSED. Three tenancy habits apply to every pass (docs/tms-build-status.md, standing rule 2026-09-24).

## Built and in use
- Onboarding: apply, pipeline, PEI, ICA, pay setup, go-live, deactivation — build-status, stages 3a–3e; PEI 2026-09-23
- Compliance & documents: expiry monitoring, reminders, binder share, inspections — build-status, 2026-09-11/12
- Dispatch board (status-driven) and day logs — build-status, dispatch board entries
- Driver app: documents, uploads, messages, ICA signing — build-status, operator portal entries

## Built, not yet used (test-sized data only)
- Load entry & management — build-status, Module 2
- Rate-con parsing (upload and email) — build-status, rate-con parsing
- Brokers directory — build-status, broker foundation
- Driver settlement run and review — build-status, Module 4; per-driver pay passes 2–5
- Invoicing / billing queue — build-status, Module 7
- Fuel import and exceptions — build-status, Module 6
- Carrier creation (platform screen) — build-status, stage 4 part 2b

## Partly built
- Accessorials & detention: hand-entered charges and late queue; no detention clock — build-status, Module 5
- Deductions, R&M Deposit, cash advances: tables, no daily writer — build-status, Module 4
- Dispatch company settlement: screen, no SUPERTRANSPORT rates set — build-status, Module 7 pass 2
- Factoring: broker status only; no submission/remittance flow — wish list
- Driver check-ins at stops — build-status, operator portal

## Not started
- Payments entry and AR aging — wish list
- Load-aware dispatch board — wish list
- Financial Intelligence reporting (overhead, targets, scenarios) — wish list, Module 9
- Public tracking links — wish list

## Owed now
- Revoke PUBLIC/anon/authenticated EXECUTE on log_pei_request_audit and refuse_pei_request_delete (0060)
- Run the full suite on main after the 2026-09-24 draft merge
- Before any second carrier: definer-function audit, get_pei_queue first — wish list
