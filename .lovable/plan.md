# Compliance Alerts: readable rows, DOT Inspection tracking, non-overlapping urgency dots

## Answers to your questions first

**The red/yellow dot next to a driver's name** is the urgency indicator for that alert row:
- pulsing red = the document is already expired
- solid red = expires within 30 days
- yellow = expires later, still inside your alert window

**The "Never Renewed" pill** means no renewal has ever been recorded for that driver's document in the system (no `cert_renewed` entry in the audit log). It is not saying the driver's license is invalid — it says staff have never pressed "Renew" / logged a renewal for it. Those rows also get the tinted background and red left edge.

Both are currently unexplained in the UI, so the plan adds hover tooltips and a small legend.

## Layout recommendation

Recommended: **horizontal scroll with a frozen Operator column on laptop/desktop, and stacked cards on narrow screens.**

Reasoning: this is a scannable comparison table — staff scan down the Status and Expires columns. Wrapping every driver onto two lines doubles the vertical height and breaks that scan, and you would still be reading each driver as a block. A table with a fixed comfortable minimum width keeps every column perfectly aligned, and freezing the name column means you never lose track of who a row belongs to while scrolling right. Below tablet width, a table is unusable regardless, so those widths get a compact card per alert instead.

## Changes

1. **Scrollable aligned table (`ComplianceAlertsPanel.tsx`)**
   - Wrap the header + rows in a horizontally scrollable container with a comfortable fixed minimum width (all columns visible at their natural size — no more squeezing).
   - Replace the responsive column-hiding breakpoints with one fixed column set so nothing is dropped on a laptop.
   - Make the Operator column sticky to the left edge while scrolling.
   - Add a subtle right-edge fade so it is obvious there is more content sideways.
2. **Fix the dashed-line alignment** in Last Reminded / Last Renewed: the em dash placeholder currently sits inside a right-aligned inline pill of a different width than the date pill. It gets a fixed-width centered placeholder so empty cells line up under the column header.
3. **Card layout under the table breakpoint** — one card per alert: name + urgency dot + doc badge on top, expiry/status/last action/reminded/renewed as labeled pairs, actions in a row at the bottom.
4. **Explain the indicators**
   - Tooltip on the urgency dot: "Expired" / "Expires within 30 days" / "Expires soon".
   - Tooltip on the Never Renewed pill: "No renewal has ever been logged for this document."
   - A one-line legend under the section header showing the three dot colors.
5. **DOT Inspection in Compliance Alerts**
   - Pull `truck_dot_inspections.next_due_date` (latest per operator) alongside CDL and Med Cert, using the same alert window, urgency tiers, and sorting.
   - New "DOT Insp" doc badge (its own color), a "DOT Inspection" filter tab next to All / CDL / Medical Cert, and counts included in the header pills.
   - Remind and Renew for DOT rows follow the existing per-doc-type reminder/renewal paths; Open jumps to the operator with the inspection focus.
6. **DOT Inspection in Compliance Summary** (`InspectionComplianceSummary.tsx`)
   - Add `DOT Inspection` as a new doc key with its own chip, badge color, short label, and sort position, sourced from `truck_dot_inspections.next_due_date`.
   - Included in the All count, Expired/Critical/Valid rollups, CSV export, list rows, and driver cards.

## Technical notes
- Files: `src/components/inspection/ComplianceAlertsPanel.tsx`, `src/components/inspection/InspectionComplianceSummary.tsx`.
- DOT due dates come from `public.truck_dot_inspections` (`operator_id`, `next_due_date`), taking the most recent row per operator. No schema changes needed.
- Sticky column via `sticky left-0` on the operator cell with the row background carried onto the cell so content scrolls underneath cleanly.
- All colors stay on existing semantic tokens; no new hardcoded utilities.

## Verification
- Fleet Compliance at laptop width: all columns readable, no squeezing, name column stays visible while scrolling right, dashes centered in their columns.
- DOT Inspection rows appear in alerts and filter correctly; DOT Inspection chip appears and counts add up in the Compliance Summary.
- Tooltips on the dot and the Never Renewed pill explain both.
