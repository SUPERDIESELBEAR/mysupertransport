## Diagnosis

The driver portal (`src/pages/operator/OperatorPortal.tsx`) manages navigation with a `view` state variable synced to `?tab=…` via two effects:

- **Writer** (line 139): when `view` changes, `navigate({ search: '?tab=…' }, { replace: true })`.
- **Reader** (line 126): when `location.search` changes, `setView(tab)` for whatever tab param is currently in the URL.

The hamburger menu handler (line 1193) is:
```tsx
onClick={() => { setView(item.view); setMobileMenuOpen(false); }}
```
It relies on the writer effect to eventually push the URL. Meanwhile, several other things can mutate `location.search` on their own — most notably `NotificationBell` (line 1160), which is wired with `notificationsPath={`${location.pathname}?tab=notifications`}` and also fires while the driver is browsing. When the URL still carries a stale `?tab=notifications` (or any other tab the reader last saw), the reader effect races the writer and calls `setView(stale)` right after the user's `setView('my-truck')`, snapping the view back or to a different tab.

The code already knows this race exists. The `OperatorStatusPage.onNavigateTo` handler at line 1533 goes out of its way to work around it with the comment: *"Push the URL directly so the writer/reader effects can't race back to a stale tab (e.g. `?tab=notifications`) left over from opening the notification bell."* It imperatively `navigate('?tab=…', { replace: false })` at the same time as `setView(target)`. The `onOpenBinder` handler at line 1566 does the same thing.

The hamburger menu, desktop sidebar, and mobile bottom nav all still use the naive `setView(item.view)` pattern and are therefore vulnerable to the exact same race. This matches the reported symptoms:
- First tap: view state flips to the new value, then the reader effect immediately resets it from the stale URL → screen doesn't change.
- Second tap: the URL is now in some intermediate state (e.g., `?tab=notifications` from an earlier bell open), so `setView('my-truck')` gets overwritten by the reader's `setView('notifications')` — but here the user sees whatever the stale tab was (ICA, in the report).
- Nth tap: the URL and state eventually converge and the correct view sticks.

Layout shift from the inline (non-fixed) mobile menu can compound this on some devices, but the primary cause is the writer/reader race, which is deterministic and reproducible in code review.

## Fix

Adopt the same atomic pattern the Status page and Open Binder handler already use: update the URL directly at the moment of the click, so the reader effect sees the intended tab immediately and cannot race back to a stale value.

### Changes (all in `src/pages/operator/OperatorPortal.tsx`)

1. **Add a single navigation helper** near the top of the component, right after the writer effect:

   ```ts
   const navigateToView = useCallback((target: OperatorView) => {
     setView(target);
     const search = target && target !== 'progress' ? `?tab=${target}` : '';
     if (window.location.search !== search) {
       navigate({ pathname: '/operator', search }, { replace: false });
     }
   }, [navigate]);
   ```

2. **Replace the four naive handlers** to call `navigateToView`:
   - Line 1038 (preview tab bar): `onClick={() => navigateToView(item.view)}`
   - Line 1079 (desktop sidebar): `onClick={() => navigateToView(item.view)}`
   - Line 1193 (mobile hamburger menu): `onClick={() => { navigateToView(item.view); setMobileMenuOpen(false); }}`
   - Line 1867 (mobile bottom nav): `onClick={() => { navigateToView(item.view); setMobileMenuOpen(false); }}`

3. **Leave the existing handlers that already use the imperative-navigate pattern alone** (`onNavigateTo` at 1533, `onOpenBinder` at 1566, deep-link handlers). They already do the right thing; consolidating them into `navigateToView` is out of scope for a bug fix.

No changes to the reader or writer effects, `NotificationBell`, `viewHistory`, or the bottom nav's visual behavior.

### Other places using the same pattern

The staff and management portals use separate `view` state variables but do not share the same URL sync effects with an external component (like `NotificationBell`) writing tab params, so they are not affected. No other driver-facing surface needs a matching change.

## Verification

1. As a test driver on a mobile viewport, open the hamburger menu and select each item once (My Progress, Documents, Doc Hub, Inspection Binder, My Documents, My Truck, Resource Center, Pay Setup, Settlement Forecast, FAQ, Messages). Every selection must land on the correct screen on the **first** tap.
2. Rapidly switch between Settlement Forecast → My Truck → ICA → Doc Hub → My Truck via the hamburger. Each tap should produce exactly one navigation to the selected screen.
3. Open the notification bell (which sets `?tab=notifications`), close it, then use the hamburger to jump to My Truck — this is the exact scenario that reproduces the reported race today. Should now go straight to My Truck.
4. Confirm the bottom nav (Status, Binder, Messages, Doc Hub, FAQ) still highlights correctly and navigates on first tap.
5. Confirm the header Back button (`goBack`) and hardware back button still pop the in-app view history the way they do today.
