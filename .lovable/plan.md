# Simplify Compliance Alerts columns

## What you circled
The circled column is **Last Renewed**. It shows a dash with the tooltip "Not yet renewed" for every row, because a row only appears in Compliance Alerts when the document is expiring or expired — i.e. not renewed yet. Once staff mark it renewed and the new expiry date is saved, the row drops out of the alerts list. So the column can only ever show a dash here.

The column immediately to its left is **Last Action**, which shows whichever happened most recently — a reminder or a renewal. In practice that is always the reminder, so it duplicates the **Last Reminded** column (same date, just a green/blue pill with "Reminded ... by ...").

## Proposed change
Keep one outreach column and drop the two redundant ones:

- Remove the **Last Renewed** column (header + cell).
- Remove the **Last Action** column (header + cell), and move its sort control onto the **Last Reminded** header so you can still sort by oldest/newest outreach.
- Keep **Last Reminded** as the single source of truth: date pill, freshness color (green recent, yellow stale), email delivered/failed state, and "by <staff name>" in the tooltip.
- Reclaim the freed width: reduce the table's minimum width so less horizontal scrolling is needed and each row breathes more.

Nothing changes about the Remind or Mark as Renewed buttons, or about how rows enter/leave the alerts list.

## Technical notes
File: `src/components/inspection/ComplianceAlertsPanel.tsx`

- Drop the two grid tracks from `gridCols` (currently `...120px_104px_104px_280px`) leaving one outreach track, and lower `min-w-[1284px]` accordingly (~`1060px`).
- Delete the "Last Action" header button and the "Last Renewed" header span; attach the existing `sort` toggle (`urgency` → `last_action_desc` → `last_action_asc`) to the Last Reminded header.
- Delete the Last Action IIFE cell block and the Last Renewed IIFE cell block in the row body.
- Keep the `lastRenewed` / `lastRenewedBy` state — it is still used for row highlighting, the "no action" filter, counts, and sort ordering.
- Remove now-unused icon imports only if nothing else references them.
