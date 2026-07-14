# Fleet Compliance → DOT Inspection Binder deep-link

## Change
Make "Open in Binder" on the Fleet Compliance page switch the sidebar to **DOT Inspection Binder** and pre-select that driver in the searchable picker, instead of opening the Driver Hub detail panel.

## Files

**`src/pages/management/ManagementPortal.tsx`**
- Replace the current `onOpenOperatorAtBinder` handler (line ~2104) that sets `driverHubBinderTarget` + `setView('drivers')`.
- New handler: resolve the driver's `user_id` from the passed `operatorId` (query `operators` where `id = operatorId`), then:
  - Set `view` to `'inspection-binder'`.
  - Set URL search param `driver=<userId>` (via existing `setSearchParams`) so `InspectionBinderAdmin` picks it up through its existing `urlDriver` deep-link support.
- Keep the sibling `onOpenInspectionBinder` (fleet-wide) unchanged.
- The now-unused `driverHubBinderTarget` state remains valid for other flows; leave it in place.

**`src/components/inspection/InspectionBinderAdmin.tsx`**
- Already reads `?driver=<userId>` on mount. Add a small `useEffect` that also updates `selectedDriverId` when `searchParams.get('driver')` changes at runtime (so re-navigating from Fleet Compliance while the binder view is already mounted still updates the picker). Only runs when there is no `operatorUserId` prop (i.e., admin mode).
- No other changes; the new searchable `DriverCombobox` renders the pre-selected driver correctly.

## Out of scope
- No changes to Driver Hub, no removal of `driverHubBinderTarget`.
- No changes to compliance data queries or the button's UI/label.
- No new URL routes; continues to use the existing `?view=inspection-binder&driver=<userId>` query pattern.
