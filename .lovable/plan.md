# Reset scroll to top on every driver-app view change

## Problem
In `OperatorPortal.tsx`, the bottom nav and hamburger menu swap the visible view (Home, Binder, Messages, Doc Hub, Dispatch, etc.) by updating internal state and the `?tab=` query — the underlying route doesn't change. Because the window keeps its scroll position across those swaps, tapping a new nav item lands the user wherever the previous view was scrolled to. Navigating back to a previously visited view has the same problem.

## Fix
Force scroll to the top of the window (and any scroll container the view renders into) every time the active view changes.

1. In `src/pages/operator/OperatorPortal.tsx`, add a `useEffect` keyed on the active view identifier (the same value the nav/hamburger writes) that runs on every change and calls `window.scrollTo({ top: 0, left: 0, behavior: 'auto' })`. Use `'auto'` (instant) so nav feels snappy, not smooth-scrolled.
2. Also reset any inner scroll container the portal owns (the main `<main>` / content wrapper) by giving it a ref and setting `ref.current.scrollTop = 0` in the same effect — this covers the case where the page itself doesn't scroll but a nested container does.
3. Run the reset regardless of whether the user is navigating forward to a new view or back to a previously visited one — the effect fires on any view change, so both directions are covered.
4. Respect the existing `navigateToView` flow already used to route reliably; the scroll reset hooks off the resolved view value, so it runs after the view actually renders.

## Out of scope
- No changes to the staff/management dashboards — the user's request is scoped to the front-facing driver app.
- No changes to browser back-button behavior beyond scroll: React Router still handles the history entry; only the scroll position is normalized.
- Modals, drawers, and popovers are unaffected — this only fires on top-level view changes.

## File
- `src/pages/operator/OperatorPortal.tsx` — add the ref, effect, and attach the ref to the main content wrapper. No other files touched.
