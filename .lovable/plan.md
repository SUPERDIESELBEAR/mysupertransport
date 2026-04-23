

## Hide Truck Down banner on the Applicant Detail panel

### What's happening

When you click an applicant in the pipeline, the view switches from `'pipeline'` to `'operator-detail'` (it's a full page, not an overlay). The current Truck Down banner is hidden only on the pipeline view itself — so the moment you click into an applicant, the red ribbon reappears at the top of the detail page, taking up vertical space and pulling focus away from the applicant you're reviewing.

This affects both:
- **Staff Portal** (`src/pages/staff/StaffPortal.tsx`, line 515)
- **Management Portal** (`src/pages/management/ManagementPortal.tsx`, line 756)

### Fix

One-line change in each file: extend the hide condition from `!== 'pipeline'` to also exclude `'operator-detail'`.

```tsx
// Before
{truckDownOperators.length > 0 && currentView !== 'pipeline' && (...)}

// After
{truckDownOperators.length > 0 &&
 currentView !== 'pipeline' &&
 currentView !== 'operator-detail' && (...)}
```

Same pattern applied in `ManagementPortal.tsx` using `view` instead of `currentView`.

### Why this is the right scope

- The banner still shows everywhere else (Overview, Compliance, Driver Hub, Vehicle Hub, etc.) — you're not losing the alert, just suppressing it on the two screens where it competes with applicant focus.
- Truck Down information is fundamentally about **active dispatched drivers**, not applicants going through onboarding, so the banner has no operational relevance on an applicant detail page.
- The Dispatch sidebar badge (red count next to "Dispatch Board") still shows the live truck-down count, so the alert is one click away.

### Files touched

- `src/pages/staff/StaffPortal.tsx` — extend banner hide condition (line 515).
- `src/pages/management/ManagementPortal.tsx` — extend banner hide condition (line 756).

### Out of scope

- Removing the banner globally or from other views.
- Changing the Dispatch sidebar badge or any underlying truck-down tracking.
- Touching the Dispatch Portal's own Truck Down banner (which is correctly always-on for dispatchers).

