

## Show Years, Months, and Days in Compliance Timeline

### What changes
Currently, all compliance countdowns display raw day counts (e.g., "365d left" or "Expired 42d ago"). This update introduces a shared formatting helper that converts total days into a human-friendly `Xy Xm Xd` format (e.g., "1y 2m 5d left" or "Expired 1m 12d ago"), and applies it across every compliance display.

### Helper function

Add a `formatDaysHuman(days: number): string` utility to `InspectionBinderTypes.ts`:
- If `days >= 365`: show years + remaining months + remaining days (e.g., "1y 2m 15d")
- If `days >= 30`: show months + remaining days (e.g., "3m 12d")
- If `days < 30`: show just days (e.g., "12d")
- Uses simple 365-day year and 30-day month approximation

### Files changed

| File | Change |
|------|--------|
| `src/components/inspection/InspectionBinderTypes.ts` | Add `formatDaysHuman()` export |
| `src/components/inspection/ComplianceAlertsPanel.tsx` | Replace `${Math.abs(alert.days_until)}d ago` / `${alert.days_until}d left` with `formatDaysHuman` output (~line 613) |
| `src/components/inspection/DocRow.tsx` | Replace `Expiring {days}d` with formatted string (~line 46) |
| `src/components/inspection/InspectionBinderAdmin.tsx` | Replace `Expired ${Math.abs(daysLeft)}d ago` and `Expires in ${daysLeft}d` (~lines 1958, 1994) |
| `src/components/drivers/DriverVaultCard.tsx` | Replace `{days}d left` (~line 52) |
| `src/components/drivers/DriverHubView.tsx` | Replace `${Math.abs(t.days_until)}d ago` / `${t.days_until}d left` (~line 619) |
| `src/components/fleet/FleetRoster.tsx` | Replace `{days}d` in DOT status badges (~lines 30-32) |

All existing color-coding and urgency logic remains unchanged — only the text label changes from raw days to the Y/M/D breakdown.

