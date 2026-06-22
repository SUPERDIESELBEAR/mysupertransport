## Add Cards/Table toggle to 4 more pages

Reuse the shared `ViewModeToggle` + `useViewMode` from the previous round. Wrap existing data only, no field redesign.

---

### 1. Archived Drivers — `src/components/drivers/ArchivedDriversView.tsx`
**Default: Table** (matches Driver Hub).

- Add `useViewMode('archived_drivers_view', 'mode', 'table')`.
- Place `<ViewModeToggle>` on the existing search row (right side, next to any refresh button).
- When `viewMode === 'cards'`, render a `grid sm:grid-cols-2 lg:grid-cols-3 gap-3` of cards showing: avatar/initials + name, unit #, archived date, archived reason, and the same action buttons (View, Restore if applicable).
- Existing table render kept as-is for `viewMode === 'table'`.

### 2. Equipment Inventory — `src/components/equipment/EquipmentInventory.tsx`
**Default: Table** (current EquipmentRow layout — staff scan for serial/operator).

The current "list" inside each device-type group is a row-based divider list. We'll treat that as **Table** and add a **Cards** alternative.

- Add `useViewMode('equipment_inventory_view', 'mode', 'table')`.
- Place `<ViewModeToggle>` on the filter chip row (right side).
- When `viewMode === 'cards'`, replace the `divide-y` row list inside each group with a `grid sm:grid-cols-2 lg:grid-cols-3 gap-3` of cards: device icon + serial number, status badge, assigned operator, condition notes, and the same action menu (Edit / Assign / Return / History).
- Group headers (per device type) and Show-more behavior remain identical in both modes.

### 3. MO Plate Registry — `src/components/mo-plates/MoPlateRegistry.tsx`
**Default: Cards** (already the current layout — keep it).

- Add `useViewMode('mo_plate_registry_view', 'mode', 'cards')`.
- Place `<ViewModeToggle>` on the search/filter row.
- When `viewMode === 'table'`, render a `<Table>` with columns: Plate #, State, Status, Current Driver, Unit #, Assigned Date, Actions. One row per plate.
- Existing card grid unchanged for `viewMode === 'cards'`.

### 4. PEI Queue — `src/components/pei/PEIQueuePanel.tsx`
**Recommend skipping for now.** Here's why, then ask if you still want it:

The PEI Queue is *not* a flat list — it's a collapsible accordion grouped by applicant, with an embedded table of employers under each. Flattening to cards loses the by-applicant grouping that makes the page usable (you triage one applicant at a time, not one employer at a time). A "cards" view would either:
- (a) Show one card per applicant (loses per-employer status visibility), or
- (b) Show one card per employer (loses the applicant grouping).

Neither is clearly better than what's there. The page is also unique in shape, so it doesn't gain the consistency benefit that motivates the toggle on the other pages.

**My recommendation:** leave PEI as-is. If you want it anyway, tell me which of (a) or (b) you prefer and I'll add it in a follow-up.

---

### Scope guardrails
- No data, filter, sort, RLS, or business logic changes.
- No restyling of existing rows or chips.
- Per-page storage keys: `archived_drivers_view`, `equipment_inventory_view`, `mo_plate_registry_view`.

### Verification
- Each page's toggle flips view immediately.
- Refresh page → view sticks (localStorage).
- `?mode=cards` / `?mode=table` URL overrides honored on first load.
- All actions (edit, assign, restore, etc.) work in both views.
