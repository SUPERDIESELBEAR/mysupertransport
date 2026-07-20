## Goal

When a management user clicks **Open in Binder** on a driver in the Fleet Compliance summary (for CDL / Med Cert / IRP), the DOT Inspection Binder should open with the **Driver Docs** tab already selected for that driver — instead of defaulting to the **Company Docs** tab.

## Current behavior

`InspectionComplianceSummary` calls `onOpenOperatorAtBinder(operatorId)`. In `src/pages/management/ManagementPortal.tsx` (~line 2109) the handler:

1. Looks up the driver's `user_id`.
2. Sets `?driver=<userId>` in the URL.
3. Switches to the `inspection-binder` view.

`InspectionBinderAdmin` reads `?tab=` only on initial mount for `activeTab`, defaulting to `'company'`. The `?driver=` sync effect updates the selected driver but never touches the active tab, so the user lands on Company Docs.

## Changes

1. **`src/pages/management/ManagementPortal.tsx`** — in the Fleet Compliance `onOpenOperatorAtBinder` handler (~line 2109), also set `next.set('tab', 'driver')` alongside `?driver=` before navigating to the `inspection-binder` view.

2. **`src/components/inspection/InspectionBinderAdmin.tsx`** — extend the existing `searchParams` sync effect (or add a small companion effect) so that whenever the URL `tab` param changes to a valid value (`company | driver | uploads | staging`) while the page is mounted, `setActiveTab` is called to match. This ensures the tab switch happens when navigating in from Fleet Compliance without a remount, and keeps the tab honored on subsequent deep links.

No changes to database, RLS, or the dispatch-board flipbook deep-link path (which already forces `activeTab = 'driver'` before opening the flipbook).

## Verification

- From Overview → Fleet Compliance, click **Open in Binder** on a driver card: the DOT Inspection Binder opens with the **Driver Docs** tab active and that driver preselected.
- Dispatch board's **Binder** button still opens the flipbook cover page unchanged.
- Directly visiting `/…inspection-binder?tab=company` still lands on Company Docs.
