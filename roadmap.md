# Roadmap (rewritten 2026-09-24 14:39 — see docs/passes/2026-09-24-1439-alvys-m1-load-history.md)

Direction: P48 (SUPERTRANSPORT first; demo carrier PAUSED; three tenancy habits), P49 (replace Alvys), P50–P56 (cutover answers). All in docs/tms-build-status.md, 2026-09-24. Stock takes use exact counts only.

## Milestone 1 — Loads
1. ~~Status history source and person~~ — done 2026-09-24 (0061)
2. ~~Driver proof — paperwork upload (0062), check-ins~~ — done 2026-09-24
3. ~~A recorded stop time moves the load's status~~ — done 2026-09-24 (0065; P62, P63). Driver's app hint + delivered toast + upload from "Paperwork to finish"; board auto-refresh 60s
4. ~~Broker tracking link per load — status and stops, no money (P52)~~ — done 2026-09-24 (0066; P64). /track/:token public page, "Broker tracking" card on the load page. Milestone 1 complete in code; the published site shows it after the next publish

## Milestone 2 — Invoicing
1. Invoice packet: separate PDFs or one stitched PDF, per factor/customer (P53)
2. Factor submission to Smart Freight Funding + factoring payment received
3. Direct-bill payment posting
4. Module 7 Pass 5 supplemental-invoice (-A1) decision

## Milestone 3 — Settlements
1. Deductions: one-time, recurring, N of M; per-carrier categories (P54)
2. Cash advances incl. MultiService import; repay in 1 or 3–5 settlements (P55)
3. R&M Deposit available (P55) + a real-week fuel reconciliation

## The pilot (P50)
One dispatcher and his drivers alongside Alvys; clean switch Nov 1, Dec 1 or Jan 1. Nothing migrated.

## After the pilot
- Module 9 — settle the miles question first
- Detention clock

## Rest of the TMS
### Built and in use
- Onboarding, ICAs (66) — build-status stages 3a–3e; PEI 2026-09-23
- Compliance, documents, DOT inspections (109) — build-status 2026-09-11/12
- Dispatch status board and day logs — dispatch board entries
- Driver app documents, messages — operator portal entries
- Forecasts (290 forecast loads) — Module 9 forecast entries
- Load status history (16 rows) — 2026-09-24 14:39

### Built, lightly used
- Loads (18), stops (37), load paperwork (25), rate-con intake (5) — Module 2 / rate-con entries
- Brokers directory (13), facilities (2) — broker foundation
- Settlement run (1), dispatch company settlement with SUPERTRANSPORT rates (1) — Module 4 / Module 7 pass 2
- Fuel import (1 batch) — Module 6
- Carrier creation screen — stage 4 part 2b

### Partly built
- Accessorials & detention (no detention clock) — Module 5

### Not started
- Payments/AR aging — wish list
- Before any second carrier: definer-function audit (get_pei_queue first), demo stages 5–6 — wish list
