## Status

The fix is approved, but the workspace is still in plan mode, so code changes are blocked until the plan is implemented from build mode.

## Implementation plan

1. **Make driver portal navigation direct and deterministic**
   - Update `navigateToView` in `src/pages/operator/OperatorPortal.tsx` so it updates the selected view, binder sub-view, `viewRef`, and mobile menu state in one path.
   - Route hamburger menu, desktop nav, bottom nav, in-page CTA buttons, and notification navigation through that same path.

2. **Harden URL synchronization**
   - Keep `getViewStateFromSearch(search)` as the only parser for `?tab=` and `?binderView=`.
   - Track app-initiated navigation and ignore stale `location.search` updates during the transition window.
   - Use React Router `location.pathname` / `location.search` instead of `window.location` for sync decisions where possible.

3. **Fix browser/hardware back handling**
   - Remove the `pushState` effect that runs whenever `viewHistory.length` changes.
   - Let browser back move through URL history naturally.
   - Keep the in-app Back button working by calling `navigateToView(target, { replace: true })`.

4. **Guarantee all menu items map to real screens**
   - Audit these views: My Progress, Documents, Doc Hub, Inspection Binder, My Documents, My Truck, Resource Center, Pay Setup, Settlement Forecast, ICA, Messages, FAQ, Notifications.
   - Ensure Inspection Binder only uses `binderView=pages` when intentionally requested.

5. **Notification link consistency**
   - Add an optional navigation callback to `NotificationBell` so driver notification links can use the same internal driver portal navigation path instead of bypassing it with raw route navigation.

6. **Verification**
   - Run typecheck after implementation.
   - Verify every hamburger destination on mobile, rapid switching, bottom nav, browser back, in-page CTAs, and notification links.
   - If the sandbox has no authenticated driver session, report which checks were blocked and why, and verify the routing code paths statically.