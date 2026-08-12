# Compliance Alerts: give the Open button room at the right edge

## What's happening

Two things clip the "Open →" button when you scroll fully right:

1. A fixed gradient fade strip is painted over the right edge of the table at all times, so it covers the last button even after you've scrolled to the end.
2. The actions column track is sized just barely for Remind + Renew + Open, leaving no trailing padding after the last button.

## What changes

- Hide the right-edge fade once the table is scrolled to its end (it still shows while there is more content to the right, as a scroll hint).
- Widen the actions column track and add trailing space after the Open button so it never sits flush against the container edge.
- Bump the table's minimum width to match the wider actions track, so no other column gets squeezed.

## What stays the same

Columns, data, sorting, tooltips, reminder/renew/bulk actions, and the horizontal scrollbar all behave as they do today. Layout only.

## Technical notes

- File: `src/components/inspection/ComplianceAlertsPanel.tsx`
- Track the scroll container with a ref + scroll listener; toggle the fade div (line ~846) off when `scrollLeft + clientWidth >= scrollWidth - 1`, and re-check on resize.
- Widen the last track in `gridCols` (currently `236px`) and add right padding on the row so the Open button clears the edge; raise `min-w-[1240px]` accordingly.

## Verification

Scroll the alerts table all the way right at laptop width: the Open button is fully visible, unclipped, with space after it, and the fade only appears when more content remains.
