# Remove the "No Action" Filter from Compliance Alerts

## Goal
Remove the "No Action" filter tab from the Compliance Alerts section on the Fleet Compliance page, since the redundant "Last Action" column has already been removed.

## Changes

### 1. `src/components/inspection/ComplianceAlertsPanel.tsx`
- Remove the `defaultNoActionOnly` prop and the internal `noActionOnly` state.
- Remove the "No Action" tab button from the document-type filter row (the circled `No Action 6` pill).
- Remove the `noActionCount` computation and any `noActionOnly`-dependent filtering logic.
- Remove the no-action bulk confirmation state and UI (`showNoActionBulkConfirm`, `noActionBulkSending`, etc.).
- Remove the `last_action_asc` / `last_action_desc` sort options from the `sort` state, since the Last Action column no longer exists. Keep only `urgency` sorting.
- Update the empty-state message so it no longer references the removed filter.
- Clean up any unused imports that become orphaned after these removals.

### 2. `src/pages/staff/StaffPortal.tsx`
- Remove the `alertsPanelNoAction` state and the `key` remount logic that depends on it.
- Remove `setAlertsPanelNoAction(true)` from the "No Reminder Sent" stat card click handler.
- Keep the card's scroll-to-panel behavior so it still highlights the alerts section, but make it behave like the other stat cards (no hidden filter applied).

### 3. `src/pages/management/ManagementPortal.tsx`
- Same cleanup as StaffPortal: remove `alertsPanelNoAction` state, `key` remount logic, and the `setAlertsPanelNoAction(true)` call from the "No Reminder Sent" stat card click handler.
- Keep the scroll/highlight behavior.

## Out of scope
- No changes to the underlying `cert_reminders` or `audit_log` data model.
- No changes to the individual row Remind/Renew actions or the bulk Remind/Renew buttons.
- No changes to the horizontal scrolling or column widths addressed in earlier turns.

## Verification
- Build the project and confirm no TypeScript errors.
- Open Fleet Compliance and confirm the "No Action" tab is no longer visible.
- Confirm the "No Reminder Sent" stat card still scrolls to and highlights the Compliance Alerts panel.
- Confirm sorting and filtering by document type (All / CDL / Med Cert / DOT) still works.
