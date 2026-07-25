## Problem
`CreateSignOffSheetModal` keeps its local state (`selectedOperatorId`, `assignmentDate`, `devices`, `includeBestPass`) between opens. Cancel just calls `onClose()`, so the next time the modal opens the previous selections are still there.

## Fix
In `src/components/equipment/CreateSignOffSheetModal.tsx`, reset the form fields whenever the modal transitions to closed (or when it opens fresh without an `initialOperatorId`).

Add an effect that, when `open` becomes `false`, clears:
- `selectedOperatorId` → `null`
- `assignmentDate` → today's date
- `devices` → all `{ equipmentId: null, serial: null }`
- `includeBestPass` → `false`
- `saving` / `sending` → `false`

Keep the existing `initialOperatorId` sync effect so a staff-initiated flow that pre-selects a driver still works.

No other files need changes; the fix is contained to the modal's local state.