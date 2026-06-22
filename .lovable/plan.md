## Add Cards/Table toggle to Driver Hub and Vehicle Hub

Wrap existing data in card form, no redesign of fields. Toggle behaves identically to Dispatch.

---

### Shared piece (new) — `src/components/ui/ViewModeToggle.tsx`

Small reusable component so all three pages stay visually identical and future pages take one line.

```tsx
export type ViewMode = 'cards' | 'table';

export function ViewModeToggle({
  value, onChange, className = '',
}: { value: ViewMode; onChange: (m: ViewMode) => void; className?: string }) { … }
```

Same chip styling as the Dispatch toggle (muted pill, LayoutGrid + List icons, "Cards"/"Table" labels hidden on mobile). Replace the inline toggle in `DispatchPortal.tsx` with this component so all three pages share one source of truth.

### Shared persistence hook (new) — `src/hooks/useViewMode.ts`

URL-first, localStorage-fallback:

```ts
useViewMode(storageKey: string, urlParam = 'mode', defaultMode: ViewMode = 'cards')
```

- On mount: read `?mode=`; if absent, read `localStorage[storageKey]`; else `defaultMode`.
- On set: update state, write to localStorage, update URL (replace, not push).
- Returns `[mode, setMode]`.

Storage keys: `driver_hub_view`, `vehicle_hub_view`, `dispatch_view`.

Retrofit `DispatchPortal.tsx` to use this hook so its toggle remembers across visits too.

---

### Driver Hub — `src/components/drivers/DriverRoster.tsx`

**Default: Table** (compliance scanning is the primary job).

1. Add `const [viewMode, setViewMode] = useViewMode('driver_hub_view', 'mode', 'table');`
2. Place `<ViewModeToggle>` on the existing search/filter row (already restructured for phone column).
3. When `viewMode === 'cards'`, render a `grid sm:grid-cols-2 lg:grid-cols-3 gap-3` of `DriverCard` components instead of the `<Table>`.
4. New `DriverCard` (inline or sibling file) shows the same data as one table row:
   - Avatar/initials circle + name + unit number badge
   - Phone + email (one-tap callable, same as table)
   - Dispatch status pill (top-right)
   - Compliance chips (CDL + Med Cert — reuse the new uniform chip)
   - Last sent reminder badge (if relevant)
   - Action row: Message, Open profile, Update (if compliance filter active)
5. Selection checkbox stays in the top-left of each card when bulk mode is active.

All filters, sorts, bulk actions, and compliance chips work identically — only the layout swaps.

### Vehicle Hub — `src/components/fleet/FleetRoster.tsx`

**Default: Cards** (visual unit recognition wins here).

1. Add `useViewMode('vehicle_hub_view', 'mode', 'cards')`.
2. Place `<ViewModeToggle>` on the search row (next to the search input, right side).
3. When `viewMode === 'cards'`, render a `grid sm:grid-cols-2 lg:grid-cols-3 gap-3` of `FleetCard` components.
4. New `FleetCard` shows the same data as one table row:
   - Truck icon + large Unit # (top-left)
   - DOT status badge (top-right)
   - Driver name + Owner
   - Year/Make + Plate (with state) + VIN (mono)
   - Repair cost (right-aligned at bottom)
   - Edit button (bottom-right corner)
5. Click card → opens detail (same as row click). Edit button stops propagation.

---

### Scope guardrails

- No data, filter, sort, RLS, or business logic changes.
- No restyling of existing table rows or chips.
- `DispatchPortal.tsx` change is limited to swapping its inline toggle markup for `<ViewModeToggle>` + adopting `useViewMode`.

### Verification

- Toggle on each of the 3 pages flips view immediately.
- Refresh the page → view sticks (localStorage).
- Open same page in a new tab with `?mode=table` → table view honored.
- Driver bulk-select, compliance filter, and Update buttons all work in cards view.
- Fleet Edit button in cards view opens the QuickTruckEditModal without triggering row click.

### Reminder — other pages that would benefit (for later, not now)

- **Driver Hub → Archived Drivers** (same `DriverRoster` shape; would inherit naturally if scoped wider).
- **Equipment Inventory** (`EquipmentInventory.tsx`) — items have categories/photos, cards would aid scanning.
- **MO Plate Registry** (`MoPlateRegistry.tsx`) — plates per truck, visual cards possible.
- **PEI Queue / Application list** (`PEIQueuePanel`, application lists in `ManagementPortal`) — table-first, but a kanban-style "card" view per status could help triage.
- **Pipeline Dashboard** — already card-like; not a candidate.
- **Inspection Binder Admin** — document-grid view already exists; toggle is redundant.
