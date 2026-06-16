## Problem

`NotificationHistory.tsx` uses `grid grid-cols-12` with fixed `col-span-*` cells for both the column header and every notification row. On a ~390px phone viewport the columns are too narrow for their content (badges, dates, titles), causing text and icons to overflow and overlap adjacent columns. This affects the Operator Driver App and all other portals that share this component.

## Fix

Make `NotificationHistory.tsx` responsive while preserving the existing desktop layout.

1. **Column header row** — Change `grid grid-cols-12 …` to `hidden sm:grid sm:grid-cols-12 …` so it hides on mobile.
2. **Desktop row layout** — Wrap the current `grid grid-cols-12 …` row content in a container that is `hidden sm:grid sm:grid-cols-12 …`.
3. **Mobile row layout** — Add a new mobile-only layout (`grid sm:hidden`) inside each notification row that stacks the content vertically:
   - Top row: icon + title + arrow (single line, truncate)
   - Body text (if present)
   - Bottom meta row: type badge, sent date/time, and status badge, arranged with `flex flex-wrap items-center gap-2` so they wrap cleanly on very narrow screens.
4. **Click behaviour** — Keep the existing `onClick` handler on the outer row wrapper so tapping anywhere on the mobile card still marks read and navigates.
5. **Skeleton loader** — The skeleton already uses a flex layout and does not need changes.
6. **No logic changes** — No changes to data fetching, filtering, pagination, or the `TYPE_CONFIG` mapping.

## Verification

Preview the Operator portal notification tab at mobile viewport (~390px) and confirm:
- No column overlap
- Type badge, date, and status wrap cleanly when space is tight
- Desktop view (≥640px) still shows the 4-column grid unchanged