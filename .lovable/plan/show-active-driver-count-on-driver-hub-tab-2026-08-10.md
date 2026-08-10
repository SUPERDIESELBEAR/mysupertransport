# Show active-driver count on Driver Hub tab

Add a count badge next to the **Active Drivers** tab trigger in the Driver Hub, matching the existing badge on the **Archived** tab.

## Current state

In `src/components/drivers/DriverHubView.tsx` the **Archived** tab already renders a count badge (fetched from `operators.is_active = false`). The **Active Drivers** tab only shows the icon and text with no count.

## Changes

1. Add an `activeCount` state to `DriverHubView.tsx`.
2. When the active tab's `DriverRoster` calls `onDriversChange`, set `activeCount` to `drivers.length` — this guarantees the badge matches the exact list shown in the roster.
3. Render the count badge inside the **Active Drivers** `TabsTrigger` using the same muted `bg-muted-foreground/20` style used by the archived badge.
4. Hide the badge when the count is `null` or `0`.

## Scope

- Frontend-only change in `src/components/drivers/DriverHubView.tsx`.
- No database or API changes needed; the roster already provides the data.

## Verification

- Driver Hub loads and the **Active Drivers** tab displays the same number of drivers as the roster table.
- Switching to **Archived** and reactivating a driver updates the active count when the roster refreshes.
