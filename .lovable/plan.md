# Driver App Back Button Fix

## What's happening today

Two different "back" buttons exist in the driver app, driven by two different systems:

### 1. Header back arrow (left of the SUPERTRANSPORT logo)
Lives in `src/pages/operator/OperatorPortal.tsx`. It uses a custom in-memory `viewHistory` array (lines 230–248) instead of the browser history. The array is only appended to and includes any transient view changes (auth restore, deep-link normalization, prefetch/remount), so popping it lands on views the driver never intentionally visited — the "back goes to a random screen" bug. It also drifts out of sync with React Router's real URL history that `navigateToView` pushes, so the header arrow and the phone's hardware back give different answers. On a fresh entry the array is empty so the arrow doesn't render, which reads as "stale / does nothing."

### 2. Second back arrow on the My Truck page (left of "Unit 000 🚚")
Lives in `src/components/fleet/FleetDetailDrawer.tsx`, rendered from `OperatorPortal.tsx` line 1806 with `onBack={() => navigateToView('progress')}`. The component was originally built for the staff Fleet Roster where the arrow returned to the truck list. On the driver side there is no truck list (one driver, one truck), so the arrow is redundant and its destination is arbitrary.

## Fix

### A. Header back arrow → real browser back
In `src/pages/operator/OperatorPortal.tsx`:
- Remove `viewHistory`, `suppressNextHistoryRef`, `prevConfirmedViewRef`, and the effect that appends to the array.
- Track an in-app nav counter that increments each time `navigateToView` runs a real URL push (skip `replace: true` and preview mode). Show the header arrow only when the counter > 0 so it never looks stale on first entry.
- New `goBack` = `navigate(-1)` from `react-router-dom`. This walks the real URL history the router already maintains, so Home → My Truck → Back returns to Home, and the phone's hardware back and the header arrow behave identically.
- Keep the Esc key shortcut wired to the same `goBack`.

### B. Remove the redundant My Truck back arrow (Option 1)
- Add an optional `hideBack?: boolean` prop to `FleetDetailDrawer` in `src/components/fleet/FleetDetailDrawer.tsx`; when true, skip rendering the `<ArrowLeft>` button in its header.
- In `OperatorPortal.tsx` line 1806, pass `hideBack` on the driver-side render. Staff/management usages are unchanged (they still show and need the arrow to return to the fleet list).

## Files touched

- `src/pages/operator/OperatorPortal.tsx` — swap custom history stack for `navigate(-1)`, gate arrow on in-app nav counter, pass `hideBack` to `FleetDetailDrawer`.
- `src/components/fleet/FleetDetailDrawer.tsx` — accept `hideBack` prop and conditionally render the header back arrow.

No database, RLS, or edge-function changes.
