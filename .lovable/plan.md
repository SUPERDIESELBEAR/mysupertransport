## Problem
The current `BirthdayAnniversaryPopup` is a large, fixed-position card stack near the top-right of the management dashboard. It floats over the main content area and can cover buttons, table rows, and text as users navigate the dashboard.

## Goal
Keep the same "popup notification" style (auto-appears, dismissible, stacked cards) but reposition and resize it so it does not compete with any screen content within the management dashboard.

## Current state
- Component lives at `src/components/staff/BirthdayAnniversaryPopup.tsx`.
- Rendered once at the bottom of `src/components/layouts/StaffLayout.tsx` (line 455), so it appears on every management/staff view.
- Positioned at `fixed top-16 right-16` with cards sized `w-[420px] md:w-[480px]`.
- `StaffLayout` already tracks `sidebarOpen` (desktop left sidebar) and `mobileNavItems` (mobile bottom nav). The popup does not receive either state today.
- The back-to-top button sits at `fixed bottom-6 right-6 z-40` (`src/components/ui/ScrollJumpButton.tsx`).
- The notification bell is at the top-right of the header.

## Proposed solution
1. **Move the popup to the bottom-left corner of the viewport** — the area least occupied by other fixed UI elements in the management dashboard. The back-to-top button and notification bell are on the right; the bottom-left is typically clear.
2. **Offset it to clear the sidebar and mobile bottom nav**:
   - On desktop: `bottom-6` and `left-[calc(1rem+sidebarWidth)]` so it sits just inside the main content area, not over the left sidebar.
   - On mobile: `bottom-20` so it clears the sticky bottom navigation bar.
3. **Make the cards significantly smaller**:
   - Reduce width from `420px/480px` to `320px` on desktop and `calc(100vw - sidebarWidth - 2rem)` on mobile.
   - Compact avatar (`h-10 w-10`), names (`text-sm`), labels (`text-xs`), and padding (`p-3`).
   - Keep the "Send Message" and dismiss actions but with smaller tap targets.
4. **Add a collapse/expand control** so a user can shrink the stack to a small gold badge/avatar pill when they need the screen real estate. The popup is still visible and accessible, but takes minimal space.
5. **Pass sidebar state** from `StaffLayout` into `BirthdayAnniversaryPopup` via a new prop so the popup can compute the correct offset class. Use the existing `sidebarOpen` boolean in `StaffLayout`.
6. **Verify no overlap** by checking against the most common management views (Overview stat cards, Pipeline tables, Dispatch Board, Driver Hub, Inspection Binder) at desktop and mobile viewport sizes.

## Files to change
- `src/components/staff/BirthdayAnniversaryPopup.tsx` — reposition, resize, add collapse toggle, accept `sidebarOpen` prop.
- `src/components/layouts/StaffLayout.tsx` — pass `sidebarOpen` to the popup and ensure the popup stays outside the main content flow.
- `src/index.css` (if needed) — add any new utility animation classes for the collapsed pill.

## Acceptance criteria
- Popup no longer covers the top-right header area, the notification bell, the refresh button, the back-to-top button, or any main-content buttons/text on the primary management views.
- Popup remains dismissible per-event and supports "Send Message".
- Popup is readable on mobile and does not overlap the bottom navigation bar.
- User can collapse the stack to a small indicator and expand it again.

## Out of scope
- Converting to a dropdown, drawer, or dashboard-only widget (user explicitly wants the same popup style).
- Changing the birthday/anniversary business logic or notification content.