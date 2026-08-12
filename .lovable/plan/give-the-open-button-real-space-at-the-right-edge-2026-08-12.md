# Give the Open button real space at the right edge

## What changes
- Widen the actions column so Remind / Renew / Open never sit flush against the container edge, and add trailing padding after the Open arrow.
- Narrow the right-edge gradient fade and keep it strictly a scroll hint: it disappears as soon as the table is scrolled to the end, and it never sits over the Open button when there is nothing left to scroll.
- Raise the table's minimum width to match the wider actions track so no other column gets squeezed.

## Unchanged
Columns, data, sorting, tooltips, reminders/renewals, and the horizontal scrollbar behave exactly as today. Layout only.

## Technical notes
File: `src/components/inspection/ComplianceAlertsPanel.tsx`
- `gridCols` (line 82): last track `280px` -> `330px`.
- Row action container (line 818): `pr-2` -> `pr-6`.
- Grid `min-w-[1284px]` (line 695) -> `min-w-[1340px]`.
- Fade overlay: reduce width (w-12 instead of the current wider strip) and keep the existing scroll-end check plus `pointer-events-none`.

## Verification
Scroll the alerts table fully right at laptop width: the Open text and arrow are fully visible with clear space after them, and no gradient covers them.
