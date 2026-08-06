# By Driver as an expandable section above ELD

Add a collapsible By Driver section row directly above the ELD section on the Inventory tab (where the red arrow points).

## What it looks like

- A new collapsible row styled exactly like the ELD / Dash Camera / BestPass / Fuel Card rows: chevron, driver icon, bold "By Driver" title, a count line ("42 drivers"), and right-aligned summary text ("8 missing ELD or Dash Cam").
- Collapsed by default. Clicking the header expands it in place and renders the full By Driver pairing view (cards/table toggle, search, "Missing ELD or Dash Cam" filter) inside the section body.
- The top-level tab (Inventory | By Driver | Assignment Sheets) stays exactly as it is.

## What stays

- The existing By Driver summary card in the top grid stays as-is (it still switches to the By Driver tab).

## Technical details

- `src/components/equipment/EquipmentInventory.tsx`
  - Reuse the existing `byDriverCount` / `byDriverGapCount` and `fetchByDriverCounts` for the section header counts; the summary grid and its By Driver card are unchanged.
  - Add `byDriverExpanded` state (default false) and render the new section as the first child of the device-groups container, before `activeTypes.map(...)`, reusing the same header markup pattern (`border border-border rounded-xl bg-card`, `bg-muted/30` header, rotating `ChevronDown`).
  - When expanded, render `<EquipmentByDriver />` in a padded body. Mount it lazily so its queries only run on first expand.
- No changes to `EquipmentByDriver.tsx`, no data model or query changes.