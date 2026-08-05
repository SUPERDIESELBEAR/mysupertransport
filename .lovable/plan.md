# Vehicle Hub: search across active and deactivated at once

## Problem

The Vehicle Hub search only looks inside whichever tab is selected. Searching unit "178" on the Active tab shows "No vehicles match your search," even though unit 178 exists under Deactivated. Staff have to remember to re-run the same search on the other tab.

## What changes

When the search box has text, the results ignore the Active/Deactivated tab and show matches from **all** vehicles, active and deactivated together.

- Matching deactivated units appear in the same result list, each clearly marked with a "Deactivated" badge so there's no confusion about status.
- The Active and Deactivated tab chips stay visible and, while searching, show how many matches are in each group (e.g. Active 0 / Deactivated 1). Clicking a tab still narrows to that group if the user wants.
- Clearing the search returns to the normal tab-scoped behavior, on whichever tab is selected.
- The empty state only says "No vehicles match your search" when nothing matches in either group.
- "Reactivate Unit" and the dimmed styling become per-row (driven by whether that unit is deactivated) instead of being driven by the selected tab, so they stay correct in a mixed result list.
- Same behavior in both Cards and Table view. The "These units are off the roster…" banner shows on the Deactivated tab as it does today, and also whenever a mixed search result includes deactivated units.

## Technical notes

In `src/components/fleet/FleetRoster.tsx`:

- Replace `const rows = showDeactivated ? deactivatedRows : activeRows` with search-aware source selection: when `search.trim()` is non-empty, the source is `[...activeRows, ...deactivatedRows]`; otherwise the current tab's rows.
- Extract the existing match predicate into a `matchesSearch(row, q)` helper so it can be reused for the per-tab match counts shown on the chips.
- The DOT filter chips (All / Overdue / Due Soon / No Record) and sorting continue to operate on the resulting list unchanged.
- Add a per-row `isDeactivated = !!row.deactivatedAt` and use it in place of `showDeactivated` for the row-level badge, opacity, and the Reactivate Unit button in both the card grid and the table rows.
