# Remove the "Last Action" column from Compliance Alerts

The "Last Action" column shows the most recent of reminder/renewal dates, which duplicates what the "Last Reminded" and "Last Renewed" columns already show. Removing it and reclaiming the space.

## Changes

- Delete the "Last Action" header cell and the matching data cell in each alert row.
- The sort toggle (Urgency / Last Action newest / oldest) currently lives in that header. Move it onto the "Last Reminded" header so sorting by outreach recency is still available; the underlying sort logic stays unchanged.
- Drop one track from the grid template and reduce the table minimum width accordingly, so remaining columns get more breathing room instead of leaving a gap.

## Technical details

File: `src/components/inspection/ComplianceAlertsPanel.tsx`
- Remove the `140px` track from `gridCols` (line 82) and lower `min-w-[1340px]` to about `1200px`.
- Remove the header button at lines 703-708 and re-attach its `setSort` handler + sort icons to the "Last Reminded" header span.
- Remove the Last Action IIFE block (lines 756-780).
- Keep `RotateCcw` / `CheckCheck` imports if still used by the remaining columns; drop any that become unused.
