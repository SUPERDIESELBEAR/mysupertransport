# Compliance Alerts Column Alignment Fix

## Goal
Make the Compliance Alerts table rows on the Driver Hub align into clean, predictable columns so the "Med Cert" pills and the red expiration/status pills stack vertically above one another.

## Current state
- The panel lives in `src/components/inspection/ComplianceAlertsPanel.tsx`.
- Rows and the header are rendered as `flex items-center gap-2` containers.
- The Operator column contains both the operator name and a "Never Renewed" badge, which can wrap and shifts the visual baseline of the row.
- Because the whole row is `items-center`, fixed-width siblings (the `w-[76px]` Med Cert pill, the `w-[100px]` status pill, etc.) appear staggered rather than stacked in neat vertical columns.

## Proposed change
1. Replace the header row and every alert row with a CSS grid layout that defines one track per logical column.
2. Keep the same column order and widths as today (urgency dot, operator, doc-type badge `w-[76px]`, expires `w-[88px]`, status `w-[100px]`, last action `w-[84px]`, last reminded `w-[68px]`, last renewed `w-[68px]`, remind/renew/open buttons).
3. Put the operator name and "Never Renewed" badge inside a single grid cell so wrapping happens vertically without affecting neighboring columns.
4. Preserve all existing responsive breakpoints: hide Expires/Last Action on small screens, hide Last Reminded/Last Renewed on non-XL screens, hide the "Never Renewed" badge on small screens.
5. Keep all data fetching, bulk actions, reminder/renewal handlers, and confirmation dialogs unchanged.

## Verification
- Open the Driver Hub Compliance Alerts section in the preview.
- Confirm the Med Cert pills and the expiration/status pills form straight vertical columns.
- Check that responsive hiding still works on mobile/tablet widths.
- Confirm buttons and tooltips still function as before.
