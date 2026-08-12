# Fix Compliance Alerts column alignment + remove redundant columns

## What's wrong
You're right: every data cell sits one column to the left of its header. The document badge lands under "Expires", the expiry date under "Status", the status pill under "Last Action", and so on — which also explains why the circled column at the far right looks like an unlabeled column of dashes.

Cause: the first header cell (the invisible label for the urgency-dot column) uses a screen-reader-only style that removes it from the grid entirely, so every remaining header label shifts one track left while the data rows stay correct.

## Changes
1. **Fix the header offset** — make the urgency header an actual empty grid cell so headers line up with their data: Operator, Doc, Expires, Status, Last Reminded, and the action buttons.

2. **Remove the redundant columns** (as discussed):
   - **Last Renewed** — always a dash here, because a row leaves Compliance Alerts once the doc is renewed with a new expiry date.
   - **Last Action** — duplicates Last Reminded in practice (same date, same staff name).
   - Keep **Last Reminded** as the single outreach column, with its freshness colors, delivered/failed state, and "by <staff>" tooltip. Move the existing sort control onto that header.

3. **Reclaim the space** — reduce the table's minimum width so there's less horizontal scrolling and more breathing room per row.

## Technical notes
File: `src/components/inspection/ComplianceAlertsPanel.tsx`
- Replace the `sr-only` urgency header span with a rendered empty cell (`<span aria-hidden="true" />`), keeping any accessible label inside a nested absolutely-positioned element rather than on the grid child itself.
- Drop two tracks from `gridCols` (`28px_minmax(220px,1fr)_96px_120px_140px_120px_104px_104px_280px` → remove the `120px` Last Action and one `104px` track) and lower `min-w-[1284px]` to roughly `1060px`.
- Delete the Last Action header button and the Last Renewed header span; attach the `sort` toggle to the Last Reminded header.
- Delete the Last Action and Last Renewed IIFE cell blocks in the row body.
- Retain `lastRenewed` / `lastRenewedBy` state — still used for row highlighting, the "No Action" filter, counts, and sorting.
