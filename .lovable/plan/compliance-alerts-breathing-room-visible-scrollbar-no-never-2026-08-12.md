# Compliance Alerts: breathing room, visible scrollbar, no "Never Renewed" pill

## What changes

1. **Real horizontal scrolling**
   - Keep the alerts table in one scroll container, but give the grid a comfortably wide minimum (roughly 1240px instead of 1000px) so columns are never squeezed on a laptop.
   - Make the scrollbar clearly visible and reachable at the bottom of the section (always-visible thin track rather than an overlay one that only appears mid-scroll), plus a soft right-edge fade so it reads as scrollable.
   - Header row and data rows scroll together, so labels always stay above their columns.

2. **More breathing room per row**
   - Increase the gap between columns (from `gap-2` to a wider gutter) and the row padding, so each driver ribbon has visible space top and bottom.
   - Widen the Operator, Expires, Status, Last Action, Last Reminded and Last Renewed tracks so pills and dates never touch their neighbors.
   - Keep the action buttons (Remind / Renew / Open) in one fixed-width column at the right so they line up perfectly down the table.

3. **Urgency dot no longer crowds the name**
   - Give the dot its own wider column (about 28px) with real spacing after it, and center the dot in that column.
   - The name cell no longer sits flush against the dot; names get their own left padding and stay on a single line where possible.

4. **Remove the "Never Renewed" pill**
   - Drop the per-row pill under the driver name entirely. Rows that were never renewed keep the subtle tinted background and red left edge, so the signal is still there without the clutter.
   - The "N Never Renewed" summary pill in the section header stays as-is (tell me if you want that gone too).

## Unchanged
All data loading, filters, sorting, reminder/renew/bulk actions, tooltips, and DOT Inspection tracking behave exactly as they do today. This is layout and presentation only.

## Technical notes
- File: `src/components/inspection/ComplianceAlertsPanel.tsx`.
- Adjust the `gridCols` track string, the shared subgrid row classes, the wrapper `overflow-x-auto` container, and remove the never-renewed pill block in the operator cell.
- Scrollbar visibility handled with a scoped scrollbar style using existing tokens (the project already styles webkit scrollbars globally in `index.css`).

## Verification
At laptop width, confirm: a horizontal scrollbar appears under the alerts table, columns are evenly spaced with no crowding, the urgency dot sits clear of the driver name, and no "Never Renewed" pill appears on any row.
