# Remove the "Last Renewed" Column from Compliance Alerts

## Goal
Remove the "Last Renewed" column from the Compliance Alerts table on the Fleet Compliance page. The user notes that once a driver renews a document, the alert should no longer appear in this section, making the column redundant.

## Changes

### 1. `src/components/inspection/ComplianceAlertsPanel.tsx`
- Remove the "Last Renewed" header cell from the grid header row.
- Remove the "Last Renewed" data cell IIFE block from each alert row.
- Update the shared `gridCols` template to drop the `104px` track that was reserved for Last Renewed.
- Reduce the table's `min-w` by the removed column width (from `1200px` to roughly `1096px`) while preserving the existing right-edge padding for the Open button.
- Keep all renewal logic intact: the "Mark as Renewed" row action, bulk renew, `lastRenewed` state, audit logging, and the visual row styling that distinguishes renewed rows.
- Keep the "No Action" filter and sort behavior unchanged; `lastRenewed` is still required for those features.
- Clean up any imports that become unused only as a direct result of removing the column render code.

## Out of scope
- No changes to renewal handlers, audit logging, or the Mark as Renewed / Bulk Renew workflows.
- No changes to the No Action filter, sorting, or stat-card interactions.
- No changes to horizontal scroll behavior or the right-edge gradient fade logic.

## Verification
- Build the project and confirm no TypeScript errors.
- Open Fleet Compliance and confirm the "Last Renewed" column is no longer visible.
- Confirm the remaining columns (Urgency, Operator, Doc, Expires, Status, Last Reminded, Actions) still align with their headers.
- Confirm the "Mark as Renewed" and "Remind" row actions still work.
- Confirm document-type filters and sorting still function.
