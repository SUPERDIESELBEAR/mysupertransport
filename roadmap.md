# Roadmap (rewritten 2026-09-24 — see docs/passes/2026-09-24-1242-supertransport-stock-take.md)

Direction: P48 (SUPERTRANSPORT first; demo carrier PAUSED; three tenancy habits) and P49 (replace Alvys: load tracking → invoicing → operator settlements). Both in docs/tms-build-status.md, 2026-09-24.

## Owed first (housekeeping)
1. Revoke PUBLIC/anon/authenticated EXECUTE on log_pei_request_audit and refuse_pei_request_delete (0060)
2. Full suite on main after the 2026-09-24 draft merge
3. Owner answers to the nine Alvys questions (report, step 4)

## Milestone 1 — Load tracking (replace Alvys)
1. Record load status history on every status change
2. Driver load check-ins proven in use (if drivers use Alvys for this — Q1)
3. Parallel-run week: every SUPERTRANSPORT load entered in SUPERDRIVE
4. Nice-to-have: load-aware dispatch board; tracking links

## Milestone 2 — Invoicing (replace Alvys)
1. Sendable invoice to factor/broker (Q3)
2. Factoring submission to Smart Freight Funding
3. Factoring payment received (triggers settlement eligibility)
4. Direct-bill payment posting
5. Nice-to-have: supplemental (-A1) invoice send; AR aging

## Milestone 3 — Operator settlements (replace Alvys)
1. Fuel deduction reconciled onto a real weekly settlement
2. Recurring deductions and installments — staff entry (Q4)
3. R&M Deposit balance and $200/week deduction (Q5)
4. Cash advances (Q6)
5. Payout path decided (Q8); history brought over (Q9)
6. Nice-to-have: emailed/PDF driver statement (Q7)

## Rest of the TMS
### Built and in use
- Onboarding (apply → go-live → deactivation) — build-status, stages 3a–3e; PEI 2026-09-23
- Compliance & documents, inspections — build-status, 2026-09-11/12
- Dispatch status board and day logs — build-status, dispatch board entries
- Driver app documents, messages, ICA — build-status, operator portal entries

### Built, not yet used
- Rate-con parsing — build-status, rate-con parsing
- Brokers directory — build-status, broker foundation
- Settlement run, per-driver pay — build-status, Module 4; per-driver pay passes 2–5
- Fuel import — build-status, Module 6
- Carrier creation screen — build-status, stage 4 part 2b

### Partly built
- Accessorials & detention (no detention clock) — build-status, Module 5
- Dispatch company settlement (no SUPERTRANSPORT rates) — build-status, Module 7 pass 2

### Not started
- Financial Intelligence reporting — wish list, Module 9
- Before any second carrier: definer-function audit (get_pei_queue first), demo stages 5–6 — wish list
