## Vehicle Hub — DOT Filters & Sort

Add a compact toolbar row above the vehicle grid/table with DOT status filter chips and a sort dropdown. No data, schema, or business logic changes — purely client-side filter/sort over the existing `filtered` list.

### 1. Filter chips (multi-state, single-select)

Place a new chip row directly under the Active/Deactivated toggle:

- **All** (default)
- **Overdue** — `dotNextDue` exists and `days < 0`
- **Due Soon** — `dotNextDue` exists and `0 ≤ days ≤ 30`
- **No Record** — `dotNextDue` is null

Each chip shows a live count for the current Active/Deactivated + search context. Style matches the existing Active/Deactivated chips (same `text-xs px-3 py-1.5 rounded-lg` pattern) with status-tinted backgrounds when selected: Overdue = destructive red, Due Soon = amber, No Record = muted.

### 2. Sort dropdown

A small shadcn `Select` to the right of the chip row:

- **Unit # (default)** — current behavior
- **DOT Due — Soonest first** — ascending by days-until-due
- **DOT Due — Furthest first** — descending by days-until-due

When sorting by DOT Due (either direction), **vehicles with no DOT record sort to the top** as a data-quality flag, with a subtle "Needs attention" cue already implied by the existing "No Record" badge.

When the user picks the **Overdue** or **Due Soon** chip, the sort auto-switches to "DOT Due — Soonest first" for sensible defaults. The user can still override via the dropdown.

### 3. Persistence

Both the filter chip and sort selection persist in `localStorage` under `vehicle_hub_dot_filter` and `vehicle_hub_dot_sort`, matching the existing `useViewMode` pattern. No URL params (keeps the URL clean; view mode already uses `?mode=`).

### 4. Applies to both views

Cards and Table views both render from the same filtered+sorted list, so the toolbar works identically in both.

### Technical notes

- New `useMemo` derives `filteredAndSorted` from `filtered` using a small helper `daysUntilDue(row)` returning `null` for missing records.
- Sort comparator places `null` first when sorting by DOT, otherwise falls back to Unit # numeric sort.
- No changes to `FleetRow`, queries, or `ViewModeToggle`.

### Files

- `src/components/fleet/FleetRoster.tsx` — add toolbar row, filter/sort state, memoized derived list.

### Out of scope

- No changes to Driver Hub, Dispatch, or other roster pages (can be applied later if desired).
- No new DOT thresholds or badge logic — reuses existing `dotStatusBadge` rules.
