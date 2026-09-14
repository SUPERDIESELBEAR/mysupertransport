## Technical detail

No database changes. Read-only computation from data that already exists.

**New helper** `src/lib/unitNumbers.ts`
- `fetchUsedUnitNumbers()` — selects `unit_number` from `operators` and `onboarding_status` (the live values sit on `onboarding_status`; `operators.unit_number` is largely null today, so both are read and merged).
- `computeUnitSuggestions(used)` — normalizes to trimmed strings, keeps purely numeric entries for sequencing, returns `{ next, gaps }`:
  - working range = numeric values of the same digit length as the dense cluster (three digits today); `next = max(range) + 1`.
  - `gaps` = unused integers between `min(range)` and `max(range)`, ascending, capped at the first 12 for display.
  - any in-use value, numeric or not, is excluded from both `next` and `gaps`.
- Pure function, unit-tested with the current live shape (000, 67, 124–271 with gaps, 1900, 1901, ELD-TEST) plus empty and single-value cases.

**New component** `src/components/fleet/NextUnitNumberHint.tsx`
- Props: `value`, `onPick(value)`. Fetches via React Query (`['unit-numbers','used']`, short stale time).
- Renders the "Next available" button and the ascending gap chips; hides itself while loading or when no suggestion can be derived.

**Wiring**
- `src/components/drivers/AddDriverModal.tsx` — under the existing unit input (line ~296), `onPick` sets `form.unit_number`.
- `src/pages/staff/OperatorDetailPanel.tsx` — under the unit input (line ~5957), `onPick` calls `updateStatus('unit_number', …)`. Existing `UnitNumberConflictAlert` stays as-is.

**Out of scope**
- No auto-fill, no reservation of numbers, no writes to `vacant_units` (currently empty).
- No change to duplicate detection, save logic, or existing driver records.

**Verification**
- Unit tests for `computeUnitSuggestions`.
- Browser check of both screens confirming the suggested number matches a live query of numbers in use, and that clicking fills the field.
