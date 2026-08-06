# Dispatch Board — card header pills + Edit button placement

Scope: Dispatch Board **cards view only**. List/table view untouched.

## 1. Keep the "days ago" timestamp on the top line

Today the status badge, streak chip, "unlogged" chip, and "Acknowledged" chip all live on one wrapping row with the timestamp pushed right. When a driver has an extra chip, the row wraps and the timestamp drops to a second line.

Change: split the header into two stacked rows.
- Row 1: primary status pill (Dispatched / Home / Truck Down / Not Dispatched) on the left, "x ago" timestamp pinned right — always together, never wrapping apart.
- Row 2 (only rendered when at least one exists): secondary chips — streak, unlogged, acknowledged — left-aligned directly under the status pill.

Result matches the screenshot's intent: "1 unlogged" sits beneath "Dispatched", and the timestamp stays on the first line.

## 2. Edit button placement

Recommendation: move **Edit** into the same action row as Binder / Decals / History / Message, as the last item, using the identical ghost button styling. Drop the `ml-auto` right-push so all five read as one consistent group. In edit mode, Save/Cancel still take the right side of that row so the primary action stays prominent.

Why: the current right-floated Edit reads as a different class of control and drifts away from the others on narrow cards; grouping it makes the card scannable and keeps tap targets aligned on mobile.

## Technical notes

All changes are in `src/pages/dispatch/DispatchPortal.tsx`, cards-view branch only:
- Header block (~lines 1593-1660): restructure into a `flex-col gap-1` wrapper; row 1 = status badge + `ml-auto` timestamp; row 2 = conditional chip row for streak / unlogged / acknowledged.
- Action row (~lines 1838-1942): remove the `ml-auto` wrapper around Edit and place the Edit button after Message with the same `h-7 text-xs gap-1 px-2` ghost classes; keep Save/Cancel in an `ml-auto` group while editing.

No data, query, or business-logic changes.
