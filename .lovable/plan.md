## Problem

Fully-onboarded drivers (with `insurance_added_date` set / Go Live confirmed) currently land on the Onboarding Progress screen when they open the app. They should instead land on the Home dashboard (3-ring binder, settlement forecast, my truck, resource center). Drivers still in onboarding should keep landing on Progress.

## Root cause

`src/pages/operator/OperatorPortal.tsx` line ~932 hard-codes the empty-route redirect target to `'progress'`:

```ts
if (segments.length > 0 && isKnownOperatorRoute(location.pathname)) return;
const target: OperatorView = 'progress';
```

This effect runs on mount before `onboardingStatus` has loaded and does not consider whether the driver is fully onboarded. `isFullyOnboarded` (derived from `onboardingStatus.insurance_added_date`) exists a few lines above but is not used here.

## Fix

Make the empty-route landing target depend on onboarding state, and only redirect once we actually know it — no rewrite while data is still loading.

1. **Track onboarding-data loaded state.** Add a `onboardingStatusLoaded` flag (set to `true` inside `fetchData` once the initial `operators` + `onboarding_status` query resolves, whether the row exists or not).
2. **Gate the empty-route redirect on that flag.** In the `useEffect` at line ~902, if the URL has no explicit route segment (empty-route case, the only branch that assigns a default target), bail out early when `!onboardingStatusLoaded`. This prevents the current premature snap to `/operator/progress` before we can tell which landing page is correct.
3. **Choose the target based on `isFullyOnboarded`.** Replace the hard-coded `'progress'` with:
   ```ts
   const target: OperatorView = isFullyOnboarded ? 'home' : 'progress';
   ```
   Add `isFullyOnboarded` and `onboardingStatusLoaded` to the effect's dependency array.
4. **Leave every other path untouched.** Deep links to `/operator/progress`, `/operator/home`, `/operator/binder`, etc. still resolve to exactly the requested view — this only changes the "empty landing" behavior. Onboarding Status remains reachable from the sidebar for fully-onboarded drivers (menu item already renders as "Onboarding Status" when `isFullyOnboarded`).
5. **Owner viewer.** The same portal is used for truck owners viewing a driver; because `isFullyOnboarded` is derived from the resolved driver's onboarding_status, they will also land on Home for fully-onboarded drivers, matching the requested behavior.

## Files

- `src/pages/operator/OperatorPortal.tsx` — add `onboardingStatusLoaded` state, set it inside `fetchData`, gate + branch the empty-route redirect on `isFullyOnboarded`.

## Validation

- Fully-onboarded driver (insurance_added_date set, Go Live) opens `/operator` or `/` → lands on Home dashboard tiles.
- In-progress driver opens `/operator` → still lands on Progress.
- Direct visits to `/operator/progress`, `/operator/binder`, `/operator/messages`, etc. render the requested view for both cohorts.
- No transient flash to Progress before Home renders (verified via console nav trace — the `redirect-empty-route` event should only fire after data loads and should target `home` for onboarded drivers).
