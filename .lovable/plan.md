Plan: Relocate the Birthday/Anniversary popup to the top-right, left of the notification bell

Problem
-------
The `BirthdayAnniversaryPopup` is currently fixed at `bottom-4 right-4` with a 320 px width. It overlaps the `ScrollJumpButton` ("Back to top") fixed in the same bottom-right corner, making it hard to see and interact with.

Goal
----
Move the popup to the top of the management dashboard, positioned just to the left of the notification bell icon, and make it larger/more visible.

Proposed implementation
----------------------
1. Update `src/components/staff/BirthdayAnniversaryPopup.tsx`
   - Reposition the fixed container from `bottom-4 right-4` to `top-16 right-16` (just below the header, immediately left of the notification bell). Use `z-50` so it floats above page content.
   - Keep the outer wrapper `pointer-events-none` and individual cards `pointer-events-auto`.
   - Enlarge the popup for visibility:
     - Width: `w-[420px] md:w-[480px] max-w-[calc(100vw-2rem)]`.
     - Card padding: `p-4`.
     - Avatar: `h-14 w-14`.
     - Name: `text-base font-semibold`.
     - Label/sub-label: `text-sm`.
     - Dismiss icon: `h-5 w-5`.
     - "Send Message" button: `h-8 text-sm`.
   - Keep the list scrollable with `max-h-[80dvh] overflow-y-auto` if many events stack up.
   - Keep the existing "+N more" / "Show fewer" toggles, but increase their tap target size.

2. Verify `src/components/layouts/StaffLayout.tsx`
   - Confirm that `<BirthdayAnniversaryPopup />` is already rendered at the end of the layout (line 455), so it overlays the whole shell without being clipped by the scrollable main area.
   - If the header or notification bell dropdown visually sits above the popup, raise the popup to `z-[60]`; otherwise leave it at `z-50`.

3. Responsive check
   - Desktop: popup should sit below the header, left of the notification bell, and not overlap the Back-to-top button.
   - Mobile/tablet: popup should use the same top/right anchor but adapt width to avoid touching the left edge; confirm it does not cover the mobile header or bottom nav.

Out of scope
------------
- No backend, auth, or event-fetching changes.
- No changes to the `SendBirthdayAnniversaryModal` or the dismissal logic.
- No changes to the notification bell component itself.

Acceptance criteria
-------------------
- Birthday/anniversary popup appears at the top of the management dashboard, to the left of the notification bell.
- Popup no longer overlaps the Back-to-top button.
- Popup is larger and easier to read (wider card, larger text/avatar, larger tap targets).
- Dismiss and Send Message actions still work as before.