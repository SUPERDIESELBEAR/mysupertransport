# Fleet Compliance — "Open in Binder" routes to the wrong place

## Problem

On the Fleet Compliance page (Overview view), clicking **"Open in Binder"** on a driver row currently opens the operator's applicant/pipeline detail panel — the same view used for in-progress applicants. That is confusing for a fully-onboarded, active driver. The staff member expects to land in the driver's **Driver Hub profile** with the **Inspection Binder section auto-expanded and scrolled into view**.

The mis-route is a single line in `src/pages/management/ManagementPortal.tsx` (line 2104):

```tsx
onOpenOperatorAtBinder={(id) => { setSelectedOperatorId(id); setView('operator-detail'); }}
```

The correct pattern already exists in the same file for the Dispatch Board's Binder button — it uses `driverHubBinderTarget` + the Driver Hub view's `initialSelectedOperatorId` / `scrollToBinderOnOpen` props to open the driver in the hub and auto-scroll to the Inspection Binder section.

## Fix

Route **"Open in Binder"** from Fleet Compliance to the same Driver Hub + auto-scroll flow the Dispatch Board uses.

In `src/pages/management/ManagementPortal.tsx`, change the `InspectionComplianceSummary` handler:

```tsx
onOpenOperatorAtBinder={(id) => {
  setDriverHubBinderTarget({ operatorId: id });
  setView('drivers');
}}
```

Leave `onOpenOperator` (plain row click) pointed at `operator-detail` unchanged — only the explicit "Open in Binder" affordance should jump straight to the binder.

## Technical notes

- No prop or component changes needed — `DriverHubView` already supports `initialSelectedOperatorId` and `scrollToBinderOnOpen`, and `driverHubBinderTarget` state already exists with cleanup on view change.
- No database, RLS, or edge-function changes.
- No changes to `InspectionComplianceSummary.tsx`.
