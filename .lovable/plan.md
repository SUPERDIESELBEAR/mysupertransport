

## Fix: Apply formatDaysHuman to Driver Hub Compliance Column

### Problem
The `expiryPill` function in `DriverRoster.tsx` (the Driver Hub's compliance column) still displays raw day counts like `{days}d` instead of the human-readable `1y 2m 5d` format. This function was not updated during the previous change — only `DriverVaultCard` and `DriverHubView` were updated.

### Fix
Import `formatDaysHuman` from `InspectionBinderTypes` and replace three occurrences of `{days}d` with `{formatDaysHuman(days)}` in the `expiryPill` function.

### Files changed

| File | Change |
|------|--------|
| `src/components/drivers/DriverRoster.tsx` | Import `formatDaysHuman`; replace `{days}d` on lines 134, 148, and 161 with `{formatDaysHuman(days)}` |

