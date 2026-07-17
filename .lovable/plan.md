Recommendation: Move the birthday/anniversary popup to the **top-right of the viewport, just below the header, immediately to the left of the notification bell**.

Why this placement works best for visual appeal and UX:
- It sits in the natural "notification zone" where users already look for alerts, so it feels intentional rather than intrusive.
- It does not cover any page content, sidebar, or the back-to-top button because it occupies the header's empty vertical space.
- It stays visible while remaining clearly distinct from the notification bell dropdown (the bell opens downward; the popup sits below the header bar).
- On mobile it can collapse to the same compact badge/pill below the mobile header, avoiding the bottom navigation bar.

Implementation plan

1. Update `src/components/staff/BirthdayAnniversaryPopup.tsx`
   - Replace the current bottom-left responsive positioning with a top-right responsive positioning:
     - Mobile: `top-14 right-4` (directly under the 56px mobile header)
     - Desktop: `top-16 right-16` (under the 64px desktop header, offset left of the bell)
   - Keep the existing compact card width (`w-[260px] md:w-72`), minimize/collapse badge, and dismiss/send actions.
   - Adjust the `+N more` / `Show fewer` and Minimize buttons so they still align with the compact card width.
   - Optionally reduce `max-h-[70dvh]` to a smaller value (e.g., `max-h-[calc(100dvh-5rem)]`) so the popup never grows below the header into the page content.

2. Verify no collision with the notification bell dropdown
   - The notification bell dropdown renders at `z-50` and drops from the bell. The popup will also use `z-50`. If both are open simultaneously, they may overlap. To keep the bell dropdown usable, set the birthday popup to `z-40` so transient bell dropdowns appear above it, or leave both at `z-50` and rely on the user dismissing one. The plan will default to `z-40` for the popup so it does not block the bell.

3. Verify `src/components/layouts/StaffLayout.tsx` needs no changes
   - The popup is already rendered once near the bottom of `StaffLayout`. No structural changes are required; only the popup's internal positioning classes change.

4. Verify mobile behavior
   - On mobile there is no persistent sidebar, so `top-14 right-4` avoids both the header and the mobile bottom nav. The minimized badge stays unobtrusive.

5. Build and visual check
   - Run `tsc --noEmit` and `bun run build` to confirm no type/build regressions.
   - Use a quick local render check to confirm the popup sits below the header, clear of the bell and page content.

No database, backend, or new dependencies are required. This is a purely presentational change.