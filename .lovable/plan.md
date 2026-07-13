## Goal
Fix the front-facing driver app so drivers can move between Status, Binder, Messages, Doc Hub, FAQ, and other tabs without getting bounced back to the same screen.

## Updated diagnosis
Since the driver has signed out/in, refreshed, removed the home-screen app, and re-added it, this is unlikely to be only a stale home-screen cache issue.

The current code still has a likely failure path: `OperatorPortal` uses the URL as the main tab source, but navigation can still be interrupted by portal remounts, `/dashboard` redirects, account-status data refreshes, and the custom in-memory back/history logic. For affected accounts, a data refresh can still make the portal re-render before the destination tab is committed, which matches the white flash and progress tracker replay.

## Implementation plan

### 1. Add an immediate navigation lock inside `OperatorPortal`
- Add a `requestedView` / `requestedBinderView` state that is set as soon as the driver taps a nav item.
- Render from `requestedView` immediately, instead of waiting for React Router to finish updating `location.search`.
- Clear `requestedView` only after the URL confirms the requested `?tab=`.
- Result: even if onboarding data refreshes mid-tap, the UI cannot snap back to the old tab.

### 2. Normalize empty driver URLs once, explicitly
- If a driver reaches `/dashboard`, `/operator`, or `/owner` with no `?tab=`, write a real tab URL immediately:
  - onboarding driver: `?tab=progress`
  - fully onboarded driver: `?tab=home`
- Do this as a one-time URL normalization, not as an ongoing redirect that can fight user taps.
- Result: there is no longer a hidden “empty URL means Status” fallback that can reappear during remounts.

### 3. Remove remaining fragile in-memory navigation stack behavior
- Simplify the custom `viewHistory` tracking so it cannot push the old page back into state during a tab transition.
- Make top-bar Back use router history or a safe previous-tab fallback only after a confirmed tab change.
- Result: a stale previous page cannot become the active page again after a tap.

### 4. Fix preview/staff impersonation navigation state
- The current preview mode short-circuits `navigateToView` without changing any local tab state.
- Add a separate local preview tab state so staff previewing an operator can actually switch tabs during testing.
- Result: staff can verify the exact driver portal behavior without relying on URL changes.

### 5. Add stronger field diagnostics, temporarily
- Extend `sd-nav-trace` to capture:
  - tapped tab
  - previous tab
  - rendered tab
  - current URL
  - whether a URL normalization or auto-home redirect happened
- Keep this local-only and capped to 50 entries.
- Result: if one driver still reports the issue, staff can see exactly what changed the tab.

### 6. Validate locally before rollout
- Use browser automation against the driver portal routing to confirm:
  - tapping each bottom-nav item updates the URL and rendered view
  - `?tab=documents`, `?tab=docs-hub`, and `?tab=faq` stay mounted after data refresh/focus events
  - the Status progress tracker does not replay unless intentionally returning to Status
  - empty `/dashboard` normalizes to an explicit tab once, then does not fight later taps

### 7. Rollout reminder
This is a frontend driver-app fix. After implementation, it must be published/updated for the affected drivers to receive it in the live SUPERDRIVE app.