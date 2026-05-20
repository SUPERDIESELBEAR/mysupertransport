## Goal

Add a fifth scope to the existing Equipment Download modal that produces a driver-centric report matching each active operator to their currently assigned ELD and Dash Cam.

## Report shape

CSV / PDF, one row per active operator:

```text
Driver Name | ELD Serial | ELD Status | Dash Cam Serial | Dash Cam Status
```

- Sorted alphabetically by driver last name, then first name.
- Blank cells when a driver has no current ELD or no current Dash Cam assignment.
- Followed by an **Unassigned Devices** section listing every ELD and Dash Cam in inventory that has no active assignment (Device Type, Serial, Status, Notes).

## Driver scope

All active operators (operators table filtered to active status — same definition used elsewhere in the app; verify during implementation). Drivers with zero assigned devices still appear with blanks so staff can see who is missing equipment.

## UI changes

`src/components/equipment/EquipmentDownloadModal.tsx`
- Add a fifth scope option: `drivers_equipment` labeled **"Drivers + Equipment (ELD & Dash Cam)"**.
- When selected, the modal's `fetchAll` path additionally pulls active operators (currently it only pulls equipment + assignments).
- CSV and PDF format both remain available.

## Export logic

`src/lib/equipmentExport.ts`
- Extend `ExportScope` union with `'drivers_equipment'`.
- Add `SCOPE_LABEL.drivers_equipment = 'Drivers + Equipment'` and slug `drivers-and-equipment`.
- Add a new builder `buildDriverEquipmentRows(items, operators)` returning:
  - `driverRows: { driver, eld_serial, eld_status, cam_serial, cam_status }[]`
  - `unassigned: ExportRow[]` (reusing existing `ExportRow` shape, filtered to ELD + Dash Cam with no operator).
- Add a new `downloadDriverEquipmentCsv(rows)` that writes both sections to one CSV with a blank line separator and a second header for the Unassigned table.
- Add a new `openDriverEquipmentPdf(rows)` that renders:
  - Header: "Equipment by Driver" + generated timestamp + counts.
  - Main table: 5 columns above.
  - Section: "Unassigned ELDs & Dash Cams" with existing PDF table styling.
  - Same gold `#C9A84C` branding, landscape letter, auto print prompt.
- Existing exporters for the other four scopes are untouched.

## Data fetch

In the modal, when scope is `drivers_equipment`, also query the operators / applications tables used elsewhere (e.g. the same shape that powers `EquipmentAssignModal` driver list — verified during implementation). Operators with no equipment assignment are joined client-side with the existing assignment map already built from `equipment_assignments`.

## Out of scope

- No DB changes, no edge functions, no changes to inventory filters, no changes to other modals.
- Fuel Cards and BestPass are not included in this report (request is ELD + Dash Cam).
- Drivers with no email / inactive operators are excluded.

## Files

- Edit: `src/lib/equipmentExport.ts` (new types + builders + exporters)
- Edit: `src/components/equipment/EquipmentDownloadModal.tsx` (new scope option, conditional fetch, dispatch to new exporters)
- No new files.
