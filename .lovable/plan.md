

## Rename "DOT Inspections" to "Periodic DOT Inspections"

### Problem
The Visual Edits tool likely duplicated text across cards. The actual source of truth is the `PER_DRIVER_DOCS` array in `InspectionBinderTypes.ts`. We also need to update the description text in `OperatorBinderPanel.tsx`.

### Changes

| File | Change |
|------|--------|
| `src/components/inspection/InspectionBinderTypes.ts` (line 48) | Change `'DOT Inspections'` → `'Periodic DOT Inspections'` |
| `src/components/inspection/OperatorBinderPanel.tsx` (line 344) | Update description text to say "Periodic DOT Inspections" |

Also need to update the seeded default order in the database's `inspection_binder_order` table (the `doc_order` jsonb array for `per_driver` scope) to match the new key name — otherwise the drag-to-reorder hook won't match the key. This will be done via a migration that updates the jsonb value.

### Note
Any Visual Edits artifacts that duplicated text should be reverted by this change since the cards render from this single array.

