# Fix horizontal scrolling on the driver Notifications page

## What's happening

The Notifications page header puts the title block and the "Mark all read" / "Refresh" buttons in one non-wrapping row. The buttons are set to never shrink and the title block has no shrink allowance, so on a phone-width screen the row is wider than the viewport. That extra width is what creates the side-to-side scrollbar circled in the screenshot (the stat cards get cut off on the right for the same reason — the page itself is wider than the screen).

## The fix

1. **Notifications header** — allow the header row to wrap on small screens and let the title block shrink/truncate instead of forcing the row wide. On phones the action buttons drop onto their own line; desktop layout is unchanged.
2. **Driver page container guard** — add a horizontal-overflow clip to the driver portal's scrolling content area so no single component can introduce a side-to-side scrollbar again, while vertical scrolling keeps working normally.
3. **Audit the rest of the driver app** — check each driver view (Home/Status, Binder, Messages, Doc Hub, Dispatch, My Truck, My Documents, Notifications, Resources/FAQ) at iPhone width in a headless browser, measure document width vs. viewport width on each, and fix any page that measures wider. Intentionally-scrollable inner strips (photo carousels, wide tables) stay scrollable — only page-level overflow is removed.

## Technical notes

- `src/components/management/NotificationHistory.tsx` (shared by staff and drivers): header row gets `flex-wrap` plus `min-w-0` on the title column; the action group stays `shrink-0` but is allowed to wrap.
- `src/pages/operator/OperatorPortal.tsx` content container (~line 1517): add `overflow-x-clip` alongside the existing `overflow-y-auto`.
- Audit: Playwright at 390x844, iterate driver routes, assert `document.documentElement.scrollWidth <= clientWidth`, report and fix offenders.