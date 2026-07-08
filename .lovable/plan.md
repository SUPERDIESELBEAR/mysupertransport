## Plan

1. **Centralize all driver portal navigation**
   - Keep the existing `navigateToView` helper, but make it the single path for changing driver portal screens.
   - Preserve the current route alias (`/dashboard`, `/operator`, or `/owner`) instead of forcing `/operator`, so URL changes do not remount or cross route boundaries unexpectedly.
   - Preserve unrelated query params like message thread IDs when appropriate, while replacing stale `tab`/`binderView` values.

2. **Remove competing URL writer behavior**
   - Replace the current effect that writes `view` back into `location.search` after render.
   - Navigation should update state and URL atomically at click time, while the URL reader should only respond to external/deep-link changes.
   - This prevents the stale `?tab=` value from winning after a hamburger selection.

3. **Update remaining direct `setView(...)` handlers**
   - Convert top-level driver-app navigation triggers still using `setView` directly to `navigateToView`:
     - home dashboard tiles
     - next-step CTA actions
     - truck-down/message dispatcher actions
     - status-page child callbacks
     - dispatch/status message callbacks
     - ICA completion/back-to-status paths where applicable
   - Keep non-navigation state changes such as opening modals unchanged.

4. **Fix binder sub-view navigation explicitly**
   - Add support for navigating to Inspection Binder with `binderView=pages` or list mode through the same helper.
   - Ensure leaving Binder clears stale `binderView=pages` so later navigation does not carry the binder sub-view into unrelated pages.

5. **Verification**
   - Use an authenticated driver preview session if available.
   - Test hamburger menu selections one-by-one: Status/Home, Documents, Doc Hub, Binder, My Docs, My Truck, Resource Center, Pay Setup, Settlement Forecast, ICA/Dispatch/FAQ, Messages, Notifications.
   - Rapidly switch between several hamburger destinations and confirm each renders on the first tap.
   - Confirm bottom navigation still switches correctly.
   - Confirm notification bell links and the Back button still behave correctly.