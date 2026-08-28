## Technical

Single file: `src/components/equipment/SerialConflictsPanel.tsx`.

- Add `pending` state holding `{ conflict, survivor } | null`. The "This one is correct" button sets `pending` instead of calling `merge` directly.
- Render an `AlertDialog` (shadcn) driven by `pending`. Body composed from the survivor and the loser records already in `conflict.items`: serials, `current_unit_number`, `current_operator_name`, falling back to `last_operator_name` / "Unassigned".
- Same-driver detection: all records in the pair share a non-null `current_operator_name` and `current_unit_number` — then show the cleanup wording rather than the "closes the other driver's assignment" warning.
- Confirm action calls the existing `merge(conflict, survivor)` unchanged, then clears `pending`. Cancel clears `pending` with no writes.
- Keep the loading state on the confirm button while `working === conflict.key`; dialog stays open until the merge settles.

No database, RLS, or `mergeEquipmentItems` changes. Dismissal storage and the "Show" restore line stay as they are.
