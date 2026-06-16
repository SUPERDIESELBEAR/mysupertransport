Remove the redundant "Within N days" dropdown from two locations, leaving it only in the Compliance Alerts section where it controls the warning window.

## Changes

1. **`src/components/inspection/InspectionComplianceSummary.tsx`** (Fleet Compliance → Compliance Summary row)
   - Remove the `<ComplianceWindowPicker />` render around line 433 and its surrounding wrapper if it becomes empty.
   - Remove the now-unused import on line 13.

2. **`src/components/drivers/DriverRoster.tsx`** (Driver Hub → Active Drivers section)
   - Remove the `<ComplianceWindowPicker />` render around line 894 and clean up the wrapper if empty.
   - Remove the now-unused import on line 16.

## Kept as-is
- `src/components/inspection/ComplianceAlertsPanel.tsx` keeps its picker — this is the canonical control.
- `useComplianceWindow` hook and `ComplianceWindowPicker` component remain unchanged; the selected value still propagates to the summary/roster via the existing storage/event sync.

No business logic changes — purely removing duplicate UI controls.