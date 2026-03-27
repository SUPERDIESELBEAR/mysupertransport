

## Add Drag-to-Reorder in Inspection Binder

### Current State
The Inspection Binder document rows are rendered from two hardcoded arrays in `InspectionBinderTypes.ts`: `COMPANY_WIDE_DOCS` (9 items) and `PER_DRIVER_DOCS` (6 items). There is no sort order stored in the database — the display order is fixed by array position.

### Approach
Use `@hello-pangea/dnd` (the maintained fork of react-beautiful-dnd) for drag-and-drop, and persist custom ordering in the database via a new `sort_order` column on `inspection_documents`. For the slot-based ordering (since documents may not exist yet), we'll store the preferred order in a lightweight JSON column or a separate small config table.

Since the document slots are static templates (not all have actual DB rows), the simplest approach is to store the ordering as a JSON preference per section, persisted in a new `inspection_binder_order` table with two rows (one for `company_wide`, one for `per_driver`), each holding an ordered array of doc-name keys.

### Changes

**1. Database migration** — Create `inspection_binder_order` table:
- Columns: `id`, `scope` (company_wide / per_driver), `doc_order` (jsonb array of key strings), `updated_at`, `updated_by`
- RLS: staff can read/write; operators read-only
- Seed with default order matching current arrays

**2. Install dependency** — `@hello-pangea/dnd`

**3. `src/components/inspection/InspectionBinderTypes.ts`** — Export default order arrays as mutable (they become fallbacks when no DB order exists)

**4. `src/components/inspection/InspectionBinderAdmin.tsx`**:
- Fetch `inspection_binder_order` on mount; use it to sort `COMPANY_WIDE_DOCS` and `PER_DRIVER_DOCS` before rendering
- Wrap each document list section in `<DragDropContext>` + `<Droppable>` + `<Draggable>`
- Add a grip/drag handle icon to each document row
- On drag end, reorder the local state and persist the new `doc_order` array to the DB
- Only staff/admin see drag handles; operator view uses the saved order but without drag capability

**5. `src/components/inspection/OperatorInspectionBinder.tsx`** — Fetch and apply the saved order so operators see the same sequence

### Files changed

| File | Change |
|------|--------|
| `package.json` | Add `@hello-pangea/dnd` |
| New migration | Create `inspection_binder_order` table with RLS |
| `src/components/inspection/InspectionBinderAdmin.tsx` | Add DnD wrappers, fetch/save order |
| `src/components/inspection/OperatorInspectionBinder.tsx` | Fetch and apply saved order |
| `src/components/inspection/InspectionBinderTypes.ts` | Minor: export default arrays for fallback use |

