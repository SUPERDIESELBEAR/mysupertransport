# Fix Compliance Alerts column alignment

## What's wrong
Every data cell sits one column to the left of its header: the doc badge lands under "Expires", the expiry date under "Status", the status pill under "Last Action", the reminder pill under "Last Reminded"'s neighbor, and so on. That's also why the last column of dashes appears unlabeled.

Cause: the first header cell — the invisible label for the urgency-dot column — uses a screen-reader-only style that pulls it out of the grid, so all remaining header labels shift one track left while the data rows stay in place.

## Change (alignment only)
- Make the urgency header a real (empty) grid cell so the header row occupies the same nine tracks as the data rows.
- Verify every header lines up with its data: Operator, Doc, Expires, Status, Last Action, Last Reminded, Last Renewed, actions.
- Match text alignment between header and cell in each column (right-aligned headers over right-aligned values, left-aligned over the doc badge) so nothing looks off-center.

No columns are removed and no data behavior changes. Once the table reads correctly, you can decide whether Last Action / Last Renewed still earn their space.

## Technical notes
File: `src/components/inspection/ComplianceAlertsPanel.tsx`
- Replace the `sr-only` urgency header `<span>` with a rendered empty cell (`<span aria-hidden="true" />`); if an accessible label is wanted, nest the `sr-only` text inside that cell rather than on the grid child.
- Re-check header text alignment classes against each row cell (Doc badge is left-aligned; Expires/Status/Last Action/Last Reminded/Last Renewed are right-aligned).
