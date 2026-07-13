## Goal
Fix the recurring driver app issue where buttons appear to reload the screen and leave the driver stuck on the Status page, including actions like **Review & Acknowledge Documents**, **Complete Pay Setup**, **Sign ICA Now**, and other portal navigation buttons.

## Diagnosis
The driver portal still depends on a fragile `?tab=` query-parameter navigation system inside one large mounted page. Several effects refresh data, normalize URLs, and re-render the Status page while navigation is happening. On mobile/PWA installs, this can look like a page reload: white flash, progress tracker refills, and the driver remains on Status.

Because multiple smaller fixes have not resolved it, the next fix should remove the fragile pattern instead of patching individual buttons again.

## Plan

1. **Convert driver app navigation to real nested routes**
   - Replace `?tab=docs-hub`, `?tab=pay-setup`, `?tab=ica`, etc. with stable paths like:
     ```text
     /operator/status
     /operator/documents
     /operator/doc-hub
     /operator/pay-setup
     /operator/ica
     /operator/messages
     /operator/binder
     ```
   - Keep backward compatibility so old links like `/operator?tab=docs-hub` automatically redirect once to the matching route.

2. **Remove the tab-normalization race**
   - Eliminate the effect that rewrites empty or invalid `?tab=` URLs after onboarding data loads.
   - Make the route path the single source of truth for the current screen.
   - This prevents data refreshes from forcing the app back to Status.

3. **Create a safe driver navigation helper**
   - Replace button calls like `navigateToView('docs-hub')` with a route helper that maps each destination to a real path.
   - Use this same helper for top nav, mobile menu, status-page CTAs, document review, pay setup, ICA signing, notifications, and message links.

4. **Harden action buttons against accidental submit/reload behavior**
   - Audit driver-facing CTAs in `OperatorPortal`, `OperatorStatusPage`, `SmartProgressWidget`, ICA signing, document hub, and pay setup.
   - Ensure all navigation/action buttons explicitly use `type="button"` and do not rely on form submit behavior.

5. **Remove forced refresh behavior from driver navigation paths**
   - Keep manual refresh available, but ensure normal navigation does not call `window.location.reload()` or trigger a full app reload.
   - Leave update notifications as manual “Refresh now” prompts only.

6. **Add driver-safe route fallbacks**
   - If a driver opens `/operator`, redirect to `/operator/status` or `/operator/home` based on onboarding status.
   - If a driver opens an unknown driver sub-route, show a friendly fallback with a button back to Status instead of dumping them into a broken state.

7. **Verify the highest-risk flows**
   - Test direct navigation and button clicks for:
     - Status → Review & Acknowledge Documents
     - Status → Complete Pay Setup
     - Status → Sign ICA Now
     - Mobile hamburger menu → any page
     - Bottom nav → Doc Hub / Messages / Binder
   - Confirm the URL changes to a real path and does not snap back to Status.

## Files expected to change
- `src/App.tsx`
- `src/pages/operator/OperatorPortal.tsx`
- `src/components/operator/OperatorStatusPage.tsx`
- `src/components/operator/SmartProgressWidget.tsx`
- Possibly `DocumentHub`, `ContractorPaySetup`, and `OperatorICASign` if they contain internal navigation CTAs.

## Expected result
Driver app navigation becomes route-based and resilient. Tapping a button should move to the intended screen without a white flash/snap-back loop, even for installed home-screen users and drivers with stale sessions.