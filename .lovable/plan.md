## Goal

When a management/staff user clicks **Binder** on a driver card in the Dispatch Board, take them straight to that driver's DOT Inspection Binder **flipbook**, opened to the cover page — instead of the current behavior, which drops them into the Driver Hub scrolled to the binder section.

## Current behavior (verified)

- `src/pages/dispatch/DispatchPortal.tsx` fires `onOpenDriverBinder(operatorId, userId, name)` when the Binder button is clicked (lines 1822–1834 and 2195–2205).
- In `src/pages/management/ManagementPortal.tsx` (lines 1818–1828), that callback currently sets `driverHubBinderTarget` and switches `view` to `'drivers'`, which renders `DriverHubView` scrolled to the binder card.
- `src/components/inspection/InspectionBinderAdmin.tsx` already:
  - Reads `?driver=<userId>` from the URL and pre-selects that driver (lines 111, 121, 126–130).
  - Owns `flipbookOpen` state (line 150) that renders `BinderFlipbook`.
- `src/components/inspection/BinderFlipbook.tsx` naturally starts on page index 0, which is the `cover` page — so simply opening the flipbook lands on the cover.

## Changes

### 1. `src/components/inspection/InspectionBinderAdmin.tsx`
- On mount / when `searchParams` change, if `?flipbook=1` (or `?view=flipbook`) is present and a driver is selected, set `activeTab='driver'` and `flipbookOpen=true`.
- Guard so it only auto-opens once per URL visit (track the driver+flag we last honored in a ref) so closing the flipbook doesn't immediately re-open it.
- After honoring, strip `flipbook` from the URL via `setSearchParams` so a manual close stays closed on re-render.

### 2. `src/pages/management/ManagementPortal.tsx`
- Change the `onOpenDriverBinder` handler passed to `<DispatchPortal>` so it:
  - Looks up the driver's `user_id` from the `operators` list already loaded in the portal (or accept the `userId` param that `DispatchPortal` already passes — the callback signature is `(operatorId, userId, name)`).
  - Switches `view` to `'inspection-binder'`.
  - Sets a new small piece of state (e.g. `binderDeepLink: { driverUserId }`) that is passed into `<InspectionBinderAdmin>` as a prop, OR pushes `?driver=<userId>&flipbook=1` into the URL before switching the view.
- Remove the `driverHubBinderTarget` / `setDriverComplianceFilter('all')` / `setView('drivers')` path from this handler (it stays for other entry points that still land in Driver Hub — verify none rely on it from Dispatch).

### 3. Prop wiring (optional, cleaner than URL-only)
- Add optional `autoOpenFlipbook?: boolean` and `driverUserId?: string` props to `InspectionBinderAdmin` so `ManagementPortal` can drive it without depending on URL params. If added, keep the URL-param path too so email deep-links keep working.

## Out of scope

- No changes to `DispatchPortal.tsx` itself — the callback signature already provides everything needed.
- No changes to the Driver Hub binder deep-link (used from other entry points like Fleet Compliance).
- No visual changes to the flipbook.

## Verification

1. From Management → Dispatch board, click **Binder** on any driver card → lands on the Inspection Binder page, driver pre-selected, flipbook overlay open on the cover page.
2. Close the flipbook → stays on Inspection Binder with driver still selected (does not re-open).
3. Existing "Open in Binder" from Fleet Compliance and Driver Hub still work unchanged.
4. Refresh with `?driver=X&flipbook=1` → same auto-open behavior; refresh with `?driver=X` alone → no auto-open (current behavior preserved).
