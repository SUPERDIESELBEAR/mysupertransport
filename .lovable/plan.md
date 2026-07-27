## Goal

1. Turn each device category in Onboard Systems → Inventory (ELD, Dash Camera, BestPass, Fuel Card) into a fully collapsed ribbon that expands to show **all** items — no more partial "first 8" preview.
2. Rename "Dash Cam" to "Dash Camera" everywhere in the app.

## Part 1 — Collapsible ribbons

Current behavior in `src/components/equipment/EquipmentInventory.tsx`: every category renders its list immediately; if a category has more than 8 items it shows only 8 with a "Show all N" footer button, and only one category can be expanded at a time.

New behavior:

```text
▸ ELD          12 devices     8 Available · 4 Assigned
▸ Dash Camera   9 devices     5 Available · 4 Assigned
▸ BestPass      6 devices     6 Available · 0 Assigned
▸ Fuel Card    14 devices    10 Available · 3 Assigned
```

- All four ribbons start **collapsed** on every page load.
- The whole header row becomes the toggle (chevron on the left, label, device count, and the existing status tallies on the right). Keyboard accessible, `aria-expanded` set.
- Clicking a ribbon expands it to show **all** of its items — the 8-item cap and the "Show all / Show less" footer button are removed entirely.
- **Multiple ribbons can be open at once**; opening one does not close the others.
- Cards vs table view toggle, search, status filter chips, and the summary stat cards all keep working exactly as today and apply within each expanded ribbon.
- The Fuel Card ribbon keeps its existing internal sub-sections (Assigned / Inventory / Deactivated) — that content just lives inside the collapsible body now.
- Deep-linking still works: when the sidebar links to a specific section (`section` prop, e.g. Onboard Systems → ELD), that one ribbon opens automatically and scrolls into view; the rest stay collapsed.
- Empty categories still render their ribbon; expanding shows the existing "No … devices found" empty state.

### Technical notes

- Replace `expandedType: DeviceType | null` with `expandedTypes: Set<DeviceType>` initialized empty, plus a `toggleType` handler.
- Delete `isExpanded = … || typeItems.length <= 8`, `showToggle`, and `displayItems` slicing; render `typeItems` in full when open.
- Keep the `sectionRefs` + `scrollElementIntoViewWithOffset` effect, keyed off the most recently opened type.
- Nothing else changes — no data fetching, backend, or permissions changes.

## Part 2 — "Dash Cam" → "Dash Camera"

Rename all user-facing occurrences across the app (the `dash_cam` database value and code identifiers are untouched):

- `src/components/equipment/EquipmentInventory.tsx` — device config label + page subtitle
- `src/components/equipment/equipmentUtils.ts`, `EquipmentItemModal.tsx`, `EquipmentAssetSheet.tsx`, `SignOffSheetList.tsx`, `EquipmentDownloadModal.tsx`
- `src/lib/equipmentExport.ts` — CSV/PDF headers and section titles ("Dash Cameras", "ELDs + Dash Cameras", "No Dash Camera", "Dash Camera Serial/Status")
- `src/components/operator/TruckInfoCard.tsx`, `OperatorReturnReceipts.tsx`, `src/pages/operator/OperatorPortal.tsx` ("Dash Camera #")
- `src/components/drivers/AddDriverModal.tsx`, `src/components/fleet/FleetRoster.tsx`
- `src/pages/staff/OperatorDetailPanel.tsx` — Stage 5 helper text
- `src/lib/staffHelp/help-index.ts` — help article title, steps, and search keywords (keeps "dash cam" as a search synonym so staff searching the old term still find it)
- `src/lib/equipmentCompletion.ts` — code comments

Screens that already say "Dash Camera" (sign-off sheet modals, OSAS signing) are already correct.
