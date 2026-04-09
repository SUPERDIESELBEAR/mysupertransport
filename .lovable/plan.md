

## Default Sort Driver Hub by Last Name A→Z

Change the initial `sortColumn` and `sortDirection` state in `DriverRoster.tsx` so the roster loads pre-sorted by last name ascending.

### Files changed

| File | Change |
|------|--------|
| `src/components/drivers/DriverRoster.tsx` | Change `sortColumn` initial state from `null` to `'driver'` and `sortDirection` from `'asc'` to `'asc'` (ensure both are set on mount) |

This is a two-line change — the existing sort logic already handles `driver` column sorting by last name, so no other code needs to change.

