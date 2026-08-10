# Driver Hub: stop the "warning" filter from sticking

## What's happening

The Driver Hub filter is remembered at the portal level, not at the page level.

In `ManagementPortal.tsx` two pieces of state (`driverComplianceFilter`, `driverDispatchFilter`) are passed into the Driver Hub as its starting filter. Clicking a compliance chip on the Overview page (Expired / Critical / Warning / Never Renewed) sets that state and jumps to the Driver Hub — correct behavior.

The problem: nothing ever clears it. Opening Driver Hub later from the sidebar reuses the last value, and because the Driver Hub view unmounts when you navigate away, it re-reads that value on every return. So once a Warning chip has been clicked, Driver Hub keeps opening pre-filtered to warnings.

## The fix

1. Clear both filters back to `all` whenever the Driver Hub is opened from the sidebar (the `Driver Hub` nav item), so a plain navigation always shows all drivers.
2. Consume the deep-link filter once: after the Driver Hub mounts with a chip-provided filter, reset the portal-level state to `all` so a later return isn't pre-filtered.
3. Keep the Overview chips working exactly as today — clicking Warning still lands on Driver Hub filtered to warnings; the user can also clear it in-page as they can now.

## Technical notes

- `src/pages/management/ManagementPortal.tsx`: reset `setDriverComplianceFilter('all')` / `setDriverDispatchFilter('all')` in the sidebar nav handler for `path: 'drivers'`, and clear them after the Driver Hub view has consumed them.
- `src/components/drivers/DriverHubView.tsx`: no behavior change needed; it already initializes local `complianceFilter` from `defaultComplianceFilter ?? 'all'`.
- No database or backend changes.
