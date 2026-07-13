## Findings so far
- Emma Mueller has an active operator account and recent web activity.
- There is also a separate management profile with the same first/last name, so future checks must use Emma’s operator `user_id` / `operator_id`, not name alone.
- Emma’s operator onboarding state is not fully onboarded and she is likely seeing the Status/My Progress screen with CTAs such as “Review & Acknowledge Documents” and “Complete Pay Setup.”
- Several driver-facing CTA buttons still lack explicit `type="button"`, especially in the onboarding checklist. On mobile/PWA, these can behave like submit buttons in unexpected DOM contexts and create the “screen refreshes but stays on Status” symptom.
- The driver portal has already started moving to route-based navigation, but it needs a complete cleanup so legacy query-param routing and data-loaded redirects cannot pull Emma back to Status.

## Plan

### 1. Complete the route-based driver portal fix
- Make `/operator/status`, `/operator/doc-hub`, `/operator/pay-setup`, `/operator/documents`, `/operator/messages`, `/operator/ica`, etc. the only source of truth for the active driver screen.
- Keep legacy `?tab=` links supported only as one-time redirects to the matching route path.
- Remove any data-dependent redirect behavior that can run after onboarding data loads and pull the user back to Status.
- Ensure notification links and in-app navigation links generate the new stable route paths instead of `/operator?tab=...`.

### 2. Harden every driver-facing CTA against accidental refresh
- Add explicit `type="button"` to all remaining driver-app action buttons in:
  - Status/My Progress cards
  - Onboarding checklist
  - Smart progress widget
  - Document Hub actions
  - Pay Setup actions
  - ICA signing actions
- For critical navigation CTAs like “Review & Acknowledge Documents,” “Complete Pay Setup,” and “Sign ICA,” wrap handlers so they prevent default browser behavior before navigating.

### 3. Add Emma-focused navigation diagnostics without exposing private data
- Expand the existing local navigation trace to record:
  - current path
  - requested destination
  - final path after navigation
  - whether the route was changed by a redirect effect
  - whether a click event came from a submit/default action
- Keep this client-side only in `localStorage` so it does not expose Emma’s data in the backend.
- Add a small hidden/support-only way for staff to copy the trace if the issue persists.

### 4. Add regression tests for the navigation failure mode
- Add or use the existing frontend test setup.
- Test that driver CTA clicks call route navigation to the correct path and do not submit/reload.
- Test legacy `/operator?tab=docs-hub` resolves to `/operator/doc-hub` and does not bounce back to `/operator/status` after onboarding data loads.

### 5. Verify the fix
- Use Playwright against the local preview to confirm direct route loads for:
  - `/operator/status`
  - `/operator/doc-hub`
  - `/operator/pay-setup`
  - `/operator/ica`
- If an authenticated Emma session is not available in the sandbox, verify public route mechanics locally and explain that Emma should test again after publishing/install refresh.

## Technical details
- Primary files to update:
  - `src/pages/operator/OperatorPortal.tsx`
  - `src/components/operator/OnboardingChecklist.tsx`
  - `src/components/operator/OperatorStatusPage.tsx`
  - `src/components/operator/SmartProgressWidget.tsx`
  - `src/components/documents/DocumentHub.tsx`
  - `src/components/operator/ContractorPaySetup.tsx`
  - `src/components/operator/OperatorICASign.tsx`
- No database schema change is expected for the core fix.
- Emma’s backend record should be referenced by her operator account IDs, not by name, because there are two Emma Mueller profiles.