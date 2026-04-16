

## Add Dispatcher Assignment Dropdown to Dispatch Portal

### What changes
Add a "Dispatcher" dropdown to both the card-view and list-view edit forms in the Dispatch Portal. When editing a driver's dispatch card, dispatchers/management can assign any dispatcher (or themselves) to that driver.

### Technical Details

**File: `src/pages/dispatch/DispatchPortal.tsx`**

1. **Fetch all dispatchers on mount** — Add a new state `allDispatchers` (`Record<string, string>`). In `fetchDispatch`, query `user_roles` for users with role `'dispatcher'` or `'management'`, then fetch their profiles to build the name map. Merge into `dispatcherNames` so the filter dropdown also benefits.

2. **Include `assigned_dispatcher` in `startEdit`** — Add `assigned_dispatcher: row.assigned_dispatcher ?? ''` to the `editData` initialization (line 642).

3. **Add dispatcher dropdown in card-view edit form** (after the status Select, ~line 1143) — A new `Select` with options: "Unassigned", current user ("Assign to Me"), and all dispatchers from `allDispatchers`.

4. **Add dispatcher dropdown in list-view edit form** — Add a new `<td>` (or insert within the existing edit area near line 1480) with the same dispatcher Select.

5. **Include `assigned_dispatcher` in `saveEdit` payload** (line 701) — Add `assigned_dispatcher: editData.assigned_dispatcher || null` to the payload object.

6. **Include `assigned_dispatcher` in bulk update payload** (~line 660) — No change needed for bulk since it only sets status, but the single-edit save must include it.

### Dispatcher dropdown options
- **Unassigned** (value: empty string → saves as `null`)
- **Assign to Me** (value: current user ID, shown with a Shield icon or "(Me)" suffix)
- All users with `dispatcher` or `management` role, sorted alphabetically

### No database changes needed
The `assigned_dispatcher` column already exists on `active_dispatch` and RLS already allows dispatchers/management to update it.

