## Fix driver mobile hamburger navigation race

### Changes (all in `src/pages/operator/OperatorPortal.tsx`)

1. **Centralize URL parsing**
   - Add `getViewStateFromSearch(search)` helper returning `{ view, binderView }`.
   - Use it for the initial `useState` values and inside the URL-change effect.

2. **Guard against stale URL reads**
   - Add `pendingViewNavigationRef` tracking the intended `{ view, binderView, search, startedAt }` whenever `navigateToView` fires.
   - In the `location.search` effect, if a pending navigation is in flight (<1500ms) and the incoming search doesn't yet match it, skip the update so a stale `?tab=` value can't overwrite the new selection.
   - Clear the ref once the URL matches (or the guard window expires).

3. **Deterministic mobile menu handler**
   - Add `handleMobileNavigate(target, options?)` that closes the menu and calls `navigateToView` in one atomic callback.
   - Replace both inline `navigateToView(...); setMobileMenuOpen(false);` sites (mobile grid menu at ~L1208 and bottom nav at ~L1865) with `handleMobileNavigate`.

4. **Preserve existing behavior**
   - Keep the `/dashboard`, `/operator`, `/owner` route alias logic in `syncViewUrl` unchanged.
   - Keep `binderView=pages` for Binder tile navigation.
   - No changes to `goBack`, `popstate` handling, or `NotificationBell` links.

### Verification

Drive the driver portal via Playwright (mobile viewport, authenticated driver):
1. Tap through hamburger items in order — My Progress, Documents, Doc Hub, Inspection Binder, My Documents, My Truck, Resource Center, Pay Setup, Settlement Forecast, ICA, Messages, FAQ, Notifications — screenshot each and confirm first-tap navigation.
2. Rapidly switch between 4–5 hamburger destinations back-to-back; confirm correct screen every time.
3. Tap each bottom nav item (Status, Binder, Messages, Doc Hub, FAQ) and confirm still works.
4. Navigate hamburger → hamburger → browser back; confirm it returns to the prior view.

Task stays open until all four verifications pass.