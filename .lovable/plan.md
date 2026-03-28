

## Add Anniversary (Start Date) Support for Pre-Existing Drivers

### Root Cause

The anniversary line in Contact Info uses `onboarding_status.go_live_date`. The Add Driver modal (used for pre-existing drivers) never sets `go_live_date`, so Johnathan has no value and the anniversary row doesn't appear.

### Solution

Two changes:

**1. Add a "Start Date" field to the Add Driver modal** (`src/components/drivers/AddDriverModal.tsx`)
- Add a date input labeled "Start Date (Anniversary)" to the pre-existing driver form
- When saving, include `go_live_date` in the `onboarding_status` update (alongside unit_number, eld_serial_number, etc.)
- This sets the anniversary for pre-existing drivers at creation time

**2. Make anniversary editable in the Operator Detail Panel** (`src/pages/staff/OperatorDetailPanel.tsx`)
- For drivers who were added without a start date (like Johnathan), staff need a way to set it after the fact
- Add the anniversary/start date as an editable field in the Contact Info section so staff can backfill it
- This writes to `onboarding_status.go_live_date`

### Files Changed

| File | Change |
|------|--------|
| `src/components/drivers/AddDriverModal.tsx` | Add "Start Date" field, save as `go_live_date` in onboarding_status |
| `src/pages/staff/OperatorDetailPanel.tsx` | Add editable anniversary date field in Contact Info section |

