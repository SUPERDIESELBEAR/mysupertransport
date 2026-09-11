## What gets built, piece by piece

### 1. Quarterly cycle engine (Vehicle Hub)

- Every power unit gets an inspection group derived from the last digit of its unit number: odd = Group A (Oct/Jan/Apr/Jul), even = Group B (Dec/Mar/Jun/Sep). Unit ending in 0 is even, per the program. This is computed, not stored by hand — no one assigns anything.
- Each unit's Vehicle Hub detail gains a **Quarterly Inspection** panel showing the current cycle: assigned month, status, days remaining, and a history of past cycles.
- **Launch credit (§5.1):** a Group A unit with a periodic inspection dated on/after Aug 1, 2026 is automatically credited for the October cycle and starts in January. One-time data pass on the existing inspection records, flagged on the cycle so staff can see why.
- **New contractors (§5.2):** the onboarding truck inspection counts as the first cycle; the unit joins the calendar at the next assigned month at least 60 days after onboarding.
- **Grace period (§9):** a staff action on the cycle grants up to 15 days into the following month. Requested-by and date are recorded. The badge counts down against the grace deadline instead of month end.
- **Grace limit (stops habitual use):** **2 grace extensions per driver per rolling 12 months**, and the limit is a setting, not a hard-coded number, so you can change it without a code change. The driver's Vehicle Hub panel shows a plain counter — "Grace used: 1 of 2 in the last 12 months" — so it is visible before anyone asks for a third. A third request does not silently fail: it is refused at the normal staff level and can only be granted as a **management override with a written reason**, which is audit-logged and surfaces on the driver's record. Two consecutive cycles using grace is flagged on the monthly summary as a pattern, even if the driver is still inside the allowance. Rolling 12 months rather than calendar year, so a driver cannot burn two in December and two more in January.
- **Overdue:** month (or grace) expires with no complete submission → the unit shows a **"Not dispatch-eligible — inspection overdue"** badge in Vehicle Hub, and the same badge appears on the Dispatch Board. Advisory only — dispatchers can still assign; the warning is impossible to miss. The badge clears the moment a complete submission is recorded.

### 2. Submission & defect closure

- Staff upload the §396.17 report and the itemized invoice to the cycle (same viewer and storage patterns as today's Vehicle Hub documents). Fields: inspection date, facility, fee amount, invoice line amount (capped at $150 reimbursement), report file, invoice file.
- **Defect closure (§11):** two recorded facts per inspection — *defects identified* and *defects repaired*. A cycle with defects cannot be marked Closed until the repair is documented. An inspection with no defects closes on submission.
- The Vehicle Hub's existing DOT periodic inspection record stays the source of truth for the inspection itself; the quarterly cycle references it rather than duplicating it.

### 3. Money review queue (Management)

- A single queue with two tabs:
  - **Inspection reimbursements** — completed submissions with the fee line (max $150), waiting to go to settlement.
  - **Clean roadside bonuses** — see next section.
- One click approves an item onto the driver's next settlement as its own line item, labeled plainly ("Quarterly DOT inspection reimbursement", "Clean roadside inspection bonus — Level II"). Reject/return sends it back with a note. Every action is audit-logged.
- Love's company-account inspections are marked "billed to company account" and never enter the queue (§7).

### 4. Clean roadside bonus (extends the roadside stop log)

- When a roadside stop is logged as a DOT inspection at Level I, II, or III with **zero violations**, it is flagged bonus-eligible automatically: $100 / $50 / $25.
- Two checks shown to the reviewer before approval: the report was submitted within 24 hours (§12.3), and an inspection case number is present (§12.2). Both are soft warnings — the reviewer decides, per "SUPERTRANSPORT verifies against the FMCSA record."
- Approved bonuses land in the same review queue and flow to settlement the same manual way. No cap, per §12.5.
- **Inspection-level reference (collapsible):** where a staff member or driver picks the inspection level, a collapsed-by-default "What is a Level I / II / III?" section shows a short plain description of each — Level I: full 37-step driver-and-vehicle check including underneath the truck, can earn a CVSA decal; Level II: walk-around of driver credentials and visible vehicle parts, no underneath check; Level III: driver-only paperwork review, no physical truck inspection. Same component reused in the roadside stop form, the review queue, and the driver-facing roadside list, so everyone reads the same definition. Content lives in one constants file, not buried in markup.

### 5. Reminders & monthly summary

- Automated reminders (in-app notification + email) at **30 days before** the assigned month, **14 days before month end**, **3 days before month end** — per unit, per cycle, on the existing scheduled-task infrastructure. Skipped automatically once a complete submission is in.
- **Monthly fleet safety summary (§15):** a Management screen (and optional monthly email) with quarterly completion rate by group, clean roadside inspections in the prior 30 days, the five most-cited violations fleet-wide, and overdue units. CSA percentiles and DataQ counts are manual-entry fields — the app has no FMCSA feed, and inventing those numbers would be worse than leaving them to staff.
