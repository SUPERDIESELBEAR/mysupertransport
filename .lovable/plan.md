

## Add Sort to Unit # and Driver Name Columns

### What changes

Add clickable sort toggles to the **Unit #** and **Driver** column headers in the Driver Roster table. Clicking a header cycles through ascending → descending → no sort.

### Implementation

**Single file:** `src/components/drivers/DriverRoster.tsx`

1. **New state:** `sortColumn: 'unit' | 'driver' | null` and `sortDir: 'asc' | 'desc'`, defaulting to `null` / `'asc'`.

2. **Sort logic in `filtered` memo:** After existing filtering and compliance sorting, apply a secondary sort based on `sortColumn`:
   - `'unit'` — sort by `unit_number` (numeric-aware: parse as number when possible, nulls last)
   - `'driver'` — sort by `last_name` then `first_name` (case-insensitive, nulls last)
   - Reverse for `desc`

3. **Column headers:** Replace the static `<TableHead>Unit #</TableHead>` and `<TableHead>Driver</TableHead>` with clickable headers showing a small sort arrow icon (`ArrowUpDown`, `ArrowUp`, or `ArrowDown` from lucide-react). Clicking toggles the sort state.

### Files changed

| File | Change |
|------|--------|
| `src/components/drivers/DriverRoster.tsx` | Add sort state, sort logic in filtered memo, clickable column headers with sort indicators |

