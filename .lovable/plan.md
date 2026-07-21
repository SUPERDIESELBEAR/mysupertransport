## Compliance Alerts — column alignment + Status de-cluster

Scope: `src/components/inspection/ComplianceAlertsPanel.tsx` only. Header row visual only — no data or logic changes.

### Changes

1. **De-cluster Status column**
   - Remove the stacked "Never Renewed" sub-pill from the Status column.
   - Render Status as a single right-aligned pill in a fixed `w-[110px]` slot.
   - Move a compact "Never Renewed" chip inline next to the operator name (hidden on `sm` and below to avoid crowding on narrow widths).

2. **Unify header ↔ row grid**
   - Header currently has no slot for the doc-type badge, so Expires/Status headers sit left of their row cells.
   - Add a `w-[92px]` spacer in the header matching the doc-type badge slot.
   - Move the doc-type badge out of the flexible operator cell into its own fixed `w-[92px]` slot so the row matches the header.
   - Give the Expires cell a fixed `w-[96px] text-right` and update the Expires header to the same width and right alignment so the date column lines up with its label.

3. **Preserve existing right-side action columns**
   - Last Action, Last Reminded, Last Renewed, and the three action-button spacers keep their current fixed widths — they already align.

### Out of scope
- No changes to sort behavior, data fetching, filters, bulk actions, or the "Compliance Score" header band.
- No color/theme changes.
