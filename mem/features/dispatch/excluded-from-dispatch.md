---
name: Excluded from Dispatch Hub
description: Per-operator flag that hides a driver from the Dispatch Board and the 5 daily count tiles (Total Active, Dispatched, Home, Truck Down, Not Dispatched) without deactivating them. Used for backup-only drivers and test accounts.
type: feature
---
The `operators.excluded_from_dispatch` boolean flag (default false) hides a driver from the Dispatch Hub aggregation while keeping them fully active in Driver Hub, Fleet Roster, Pipeline, Messaging, ICA, Compliance, Settlement Forecast, Equipment, and Notifications.

**Schema:** `operators.excluded_from_dispatch` (bool, default false), `excluded_from_dispatch_reason` (text), `excluded_from_dispatch_at` (timestamptz), `excluded_from_dispatch_by` (uuid). Indexed for the common false case.

**Where it filters:**
- `src/pages/dispatch/DispatchPortal.tsx` — `fetchDispatch` splits operators into included/excluded; only included rows appear on the board and feed the 5 status tiles. Footer line shows `X excluded from Dispatch Hub — View` linking to a re-include dialog. Realtime listener on `operators` UPDATE re-fetches when the flag flips.
- `src/pages/management/ManagementPortal.tsx` — `fetchTruckDownCount`, `fetchDispatchBreakdown`, and `fetchMetrics` all join `operators!inner(excluded_from_dispatch)` and skip excluded rows.
- `src/components/dispatch/MiniDispatchCalendar.tsx` — renders an empty-state notice instead of the calendar when the operator is excluded.
- `src/components/drivers/DriverRoster.tsx` — does NOT filter (Driver Hub still shows everyone), but surfaces a small muted "Excluded" pill next to the driver name.

**Toggle UI:** `OperatorDetailPanel.tsx` Status & Access area — gold-bordered switch with optional reason field. Writes audit_log entry `action: 'operator.dispatch_exclusion_changed'` with `{ from, to, reason }` metadata. Header shows gold "🚫 Excluded from Dispatch" pill when ON.

**Re-include flow:** Dispatch Portal footer dialog lists all excluded drivers with a one-click "Re-include" button per row.
