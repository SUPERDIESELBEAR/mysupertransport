## Problem

The Compliance Summary card on the Management → Overview page currently lists every operator that has any CDL / Med Cert expiry within 90 days — including applicants still in onboarding, archived drivers, and operators who have never reached Go Live. Screenshot shows `Laura Johnson` (expired 376d ago) even though she is not a live driver.

## Fix

In `src/pages/management/ManagementPortal.tsx` → `fetchCriticalExpiries` (~line 340):

1. Extend the `operators` select to include the fields needed to gate the row:
   - `is_active`
   - `onboarding_status(fully_onboarded, go_live_date, insurance_added_date)`

2. Before pushing a row into `rows` (the array that feeds `complianceSummary`), require ALL of:
   - `op.is_active === true`
   - `os?.fully_onboarded === true`
   - `os?.go_live_date` is set AND `<= today` (past Go Live, not merely scheduled)
   - `os?.insurance_added_date` is set (matches the same rule already applied to `v_compliance_items` per prior migration `20260707153625_update_compliance_view_filter.sql`, so both surfaces agree)

3. Leave the existing count tiles (`criticalExpiryCount`, `expiredCount`, `noReminderCount`, `driverComplianceCounts`) unchanged — they already respect `fully_onboarded` for the driver breakdown, and the raw expired/critical counts on the top tiles are still useful platform-wide signals. Only the visible **Compliance Summary list** rows get the stricter gate.

## Result

The card will only show drivers who are active, fully onboarded, insured, and past Go Live — matching the definition used everywhere else. Laura Johnson and other pre–Go Live entries drop off.

## Files touched

- `src/pages/management/ManagementPortal.tsx` (single function edit)

No DB migration, no changes to `v_compliance_items`, no API changes.