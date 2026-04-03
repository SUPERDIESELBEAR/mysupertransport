

## Fix: Truck Info Not Pre-filling in ICA Builder

### Root Cause

The ICA builder queries `onboarding_status` for truck fields including `trailer_number` (line 168 of `ICABuilderModal.tsx`). However, the `trailer_number` column **does not exist** on the `onboarding_status` table — it was never added via migration.

This causes the entire query to fail silently, returning `null` instead of the truck data. Since `onboardingRow` is null, no truck fields get pre-filled even though the data (2004 International ProStar) is correctly saved in the database.

### Solution

Two changes:

1. **Add `trailer_number` column** to `onboarding_status` via database migration — this is the missing column that breaks the query.

2. **Update `ICABuilderModal.tsx`** — add defensive handling so that if `trailer_number` is not yet available, the query still succeeds. Remove `trailer_number` from the select if it causes issues, or simply add the column (preferred).

3. **Update `OperatorDetailPanel.tsx`** — when staff saves truck info via the TruckInfoCard, also sync the values to any active ICA draft/sent contract (the previously approved plan for dual-write sync).

### Files changed

| File | Change |
|------|--------|
| Database migration | `ALTER TABLE onboarding_status ADD COLUMN trailer_number text;` |
| `src/components/ica/ICABuilderModal.tsx` | No code change needed — once the column exists, the existing query will work correctly |
| `src/pages/staff/OperatorDetailPanel.tsx` | In `handleTruckInfoEdit`, after updating `onboarding_status`, also update any `ica_contracts` with status `draft` or `sent_to_operator` for the same operator |

### Why this fixes it
The truck data (2004 International ProStar) is already saved correctly in `onboarding_status`. The only problem is the query fails because it references a non-existent column. Adding the column makes the query succeed, and the existing pre-fill logic on lines 175-189 will work as designed.

