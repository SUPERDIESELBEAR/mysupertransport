## Fix: Unit number missing on Create Sign-off Sheet

### Root cause (verified)
`CreateSignOffSheetModal.tsx` reads `unit_number` from `operators.unit_number`, but that column is empty for all active operators. The actual unit numbers live in `onboarding_status.unit_number` (confirmed via DB query — operators row shows 0 populated, onboarding_status shows real values like 222, 259, 185…).

### Change
In `src/components/equipment/CreateSignOffSheetModal.tsx`:

1. Add `unit_number` to the `onboarding_status(...)` sub-select in `fetchOperators`.
2. In the row mapper, set `unitNumber: o.unit_number ?? os?.unit_number ?? null` so the onboarding_status value fills in when the operators-level column is blank.

No other files touched. No schema changes. The rest of the modal (truck, plate, phone, email) already pulls from `onboarding_status`/`applications` and continues to work.

### Verification
- Reopen "Create Sign-off Sheet", pick Matthew Clovis and a few others → Unit line shows the number instead of "—".