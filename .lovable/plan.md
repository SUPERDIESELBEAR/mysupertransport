# Add Search Bar to Assignment Sheets Tab

Add a search input to the Onboard Systems → Assignment Sheets tab so staff can quickly find a sheet by operator, unit number, device type, or device serial number.

## What will change

- `src/components/equipment/SignOffSheetList.tsx`
  - Add a local `searchQuery` state.
  - Render a search input above the status tabs, using the existing `Input` + `Search` icon pattern already used in `EquipmentInventory`.
  - Add a `matchesSearch(sheet, query)` helper that returns `true` when the query matches any of:
    - Operator first/last name or email (from `sheet.operator.applications`)
    - Unit number (`sheet.unit_number` or `sheet.operator.unit_number`)
    - Device type label or raw value (from `sheet.items.device_type`)
    - Device serial number / snapshot (from `sheet.items.serial_snapshot`)
  - Filter `visibleSheets` by both the selected status tab and the search query.
  - Show a clear/reset button inside the search input when it has text.
  - Update the empty state message to mention the active search when no results match.

## Out of scope

- No backend changes: filtering will be client-side against the already-fetched sheet list.
- No changes to the Create Sheet, Preview, Resend, Return, or Delete flows.

## Acceptance criteria

- A search input appears in the Assignment Sheets tab.
- Typing an operator name filters the list to matching sheets.
- Typing a unit number filters the list to matching sheets.
- Typing a device type (e.g., "ELD", "Dash Camera") filters the list to sheets containing that device type.
- Typing a serial number filters the list to sheets containing that device.
- Status tabs continue to work and counts reflect the full unfiltered list.
