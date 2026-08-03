Notification icon grouping in Management Dashboard

## Goal
Rearrange the Management portal top-bar so the notification-preferences icon sits adjacent to the notification bell, matching the driver-app pattern and reducing visual clutter on mobile.

## Changes

### 1. Reorder top-bar controls in `src/components/layouts/StaffLayout.tsx`
Current order: notification preferences → refresh → bell.
New order: refresh → notification preferences → bell.
- Keep the notification preferences as the `headerActions` prop, but render it after the refresh button instead of before.
- Ensure the bell remains the rightmost control.
- Preserve existing tooltips, accessibility labels, and spacing (`gap-3 lg:gap-4`).

### 2. Mobile crowding: hide refresh on smallest screens
- Add `hidden md:flex` to the refresh button in `StaffLayout.tsx`, matching the driver app.
- On mobile, only the hamburger, notification preferences, and bell remain in the top bar, keeping the screenshot clean.

### 3. Icon consistency (optional, recommended)
- In `src/pages/management/ManagementPortal.tsx`, change the notification-preferences trigger icon from `Settings2` to `SlidersHorizontal` to match the driver app and the reference screenshot.
- No functional change; only the visual symbol changes.

## Out of scope
- No changes to the driver app (`OperatorPortal.tsx`) since its ordering is already correct.
- No changes to the bell dropdown, notification actions, or the preferences modal logic.
- No backend or state changes.

## Verification
- Open the Management dashboard preview and confirm the top-bar icon order is: refresh (hidden on mobile), sliders, bell.
- Verify the sliders icon opens the notification preferences modal and the bell still opens the notification dropdown.
- Check the mobile view (≈731 px width) to ensure refresh is hidden and the remaining icons do not overlap.
