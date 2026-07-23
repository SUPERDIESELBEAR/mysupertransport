## Plan

1. **Make fully-onboarded drivers land on Home reliably**
   - Treat a driver as fully onboarded when they have a Go Live date or the onboarding stages calculate to 100%.
   - If that condition is true and the current route is `/progress`, redirect them to `/home` even if `/progress` is a valid route.
   - Keep the manual **View onboarding status** link working by marking that navigation as intentional.

2. **Stop rendering the onboarding status page as the default post-onboarding experience**
   - The screenshot shows Emma is still on the progress route with the 100% onboarding UI.
   - For fully-onboarded drivers, the default app experience should be Home with the 3-ring binder, settlement forecast, My Truck, and Resource Center.

3. **Fix the progress banner so it cannot float mid-screen**
   - The current sticky banner is inside `OnboardingChecklist`, which is rendered below other content in `OperatorStatusPage`; sticky positioning can only stick within its current flow position.
   - Move the sticky progress banner behavior to the top of the progress screen layout, or make the status page layout put the banner first with no preceding content.
   - Ensure it sits flush under the black app header when a driver intentionally opens onboarding status.

4. **Verify with the app behavior, not just code**
   - Check the route behavior for a 100% complete / Go Live driver path.
   - Check the mobile layout so the progress banner no longer appears after the QPassport/buttons area or floats in the middle of the screen.

## Technical notes

- Files to update: `src/pages/operator/OperatorPortal.tsx`, `src/components/operator/OperatorStatusPage.tsx`, and possibly `src/components/operator/OnboardingChecklist.tsx`.
- The root cause visible from the code is that `/progress` is allowed to remain because it is a known route, and the sticky banner is nested below earlier content in `OperatorStatusPage`, so `top-0` cannot pull it above content rendered before it.