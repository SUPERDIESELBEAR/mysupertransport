## Problem

`NotificationHistory.tsx` uses `grid grid-cols-12` with fixed `col-span-*` cells for both the column header and every notification row. On a ~390px phone viewport the columns are too narrow for their content — the Type badge overlaps the Sent date, and the Sent date overlaps the Status badge (visible in the screenshot). The component is shared across Operator, Staff, Management, and Dispatch portals.

## Fix (single file: `src/components/management/NotificationHistory.tsx`)

Make the list responsive while keeping the desktop 4-column grid intact.

1. **Column header row** — Change to `hidden sm:grid grid-cols-12 …` so the column headers only render on ≥640px.
2. **Row wrapper** — Drop `grid grid-cols-12` from the outer row so the row itself is just a padded container; keep the existing `onClick`, hover, and unread highlight classes.
3. **Desktop layout** — Wrap the existing four `col-span-*` cells (Notification, Type, Sent, Status) in `<div className="hidden sm:grid grid-cols-12 items-start gap-2">…</div>` so they keep the current desktop look.
4. **Mobile layout** — Add a new mobile-only block `<div className="sm:hidden flex items-start gap-3">…</div>` that stacks the content as a card:
   - Icon + title (truncate) + arrow on the top line
   - Body preview (line-clamp-2) below
   - A wrap row with the Type badge, a short date/time string, and the Status badge pushed to the right with `ml-auto`
5. **No logic changes** — Data fetching, filters, pagination, mark-read, and `TYPE_CONFIG` are untouched.

## Verification

Preview the Operator portal `/operator?tab=notifications` at 390px and confirm:
- No column overlap; Type/Sent/Status sit cleanly on one wrapping row beneath the title
- Desktop (≥640px) still shows the original 4-column grid with headers