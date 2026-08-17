# Compact color legend on dispatch driver cards

Add a space-efficient way to see what each dispatch color means, right where the counts already sit on each driver card.

## What changes

In the mini calendar footer (the row of colored dots with counts under the month grid):

1. Each count chip becomes hover/tap-friendly: hovering a dot+count shows a tooltip like "Dispatched — 18 days this month". No new rows, no extra height.
2. A small circled "?" icon is added at the end of that row. Clicking it opens a tiny popover listing all five keys in one column:
   - green dot — Dispatched
   - amber dot — Home
   - red dot — Truck Down
   - slate dot — Not Dispatched
   - gold "?" — No status logged for a past day
3. The unlogged "?" marker gets the same explanation in the popover so the gold question marks on cells are self-explanatory.

Total added footprint on the card: one 12px icon.

## Technical notes

- File: `src/components/dispatch/MiniDispatchCalendar.tsx` (counters block at the bottom of the render).
- Reuse existing `STATUS_COLORS` map so labels/colors stay in one place; no new color literals.
- Tooltips via the existing shadcn `Tooltip` primitives; the legend uses the `Popover` already imported in this file (works for touch as well as hover).
- `HelpCircle` is already imported in this file and currently unused — it becomes the trigger.
- Presentation-only: no data fetching, schema, or dispatch-logic changes.
