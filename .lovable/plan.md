# Assignment Sheets: add a search bar (same as Inventory)

## What changes

The Assignment Sheets tab of Onboard Systems gets a search box in the same place and style as the one on the Inventory tab, sitting just above the All / Drafts / Sent / Signed / Void tabs.

Typing filters the sheet cards by:

- Driver name
- Unit number
- Driver email
- Device serial numbers listed on the sheet

Search and the status tabs work together: searching inside "Drafts" only searches drafts. The count next to each tab keeps showing the total for that status, so it stays obvious where other matches live. When a search returns nothing, the list shows "No sheets match your search" with a Clear search button instead of an empty area.

## Why the earlier attempt crashed, and how this avoids it

Sheet rows contain several fields that can be null or missing (`unit_number`, the nested `operator.applications` object, email, serials). A match function that reads those values directly throws on the first sheet with a missing operator or application record, and because that happens during render, the whole tab blanks out.

This version:

- Never dereferences nested data directly — it reuses the already-computed driver name / email fallbacks and coerces every field through a null-safe helper before lowercasing.
- Builds the searchable text from `sheet.items` with a guard for an empty or undefined array.
- Keeps the search purely client-side over the already-loaded sheets array — no new query, no new fetch, no change to loading logic.
- Leaves the existing "no sheets at all" empty state untouched, so an unfiltered empty list behaves exactly as it does today.

## Technical notes

In `src/components/equipment/SignOffSheetList.tsx`:

- Add `const [search, setSearch] = useState('')` and pass it through `useDebouncedValue` (`src/hooks/useDebouncedValue.ts`, already in the project) at 200ms.
- Add a module-level `matchesSheetSearch(sheet, q)` helper: returns `true` when `q` is empty; otherwise builds a haystack from `[first_name, last_name, unit_number, operator?.unit_number, email, ...(sheet.items ?? []).map(i => i.serial_snapshot)]`, filtered with `Boolean`, `String(...)`-coerced, joined and lowercased. All optional chaining, no assumptions about nested objects.
- `visibleSheets` becomes status filter, then `matchesSheetSearch`.
- Render the input inside the existing `tabBar` block wrapper: a `relative` div with the `Search` lucide icon absolutely positioned and an `Input` with `pl-9`, placeholder "Search driver, unit #, serial…", matching the Inventory search bar markup in `EquipmentInventory.tsx`.
- Tab counts stay derived from the unfiltered sheets array (unchanged).
- Add the filtered-empty branch keyed off the debounced search being non-empty.

No database, edge function, or query changes.