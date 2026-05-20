## Problem
In the Equipment PDF/CSV exports that include both ELDs and Dash Cams (`eld_dash_cam` scope, and the unassigned section of `drivers_equipment`), devices are sorted alphabetically by `device_type`. Because "dash_cam" < "eld" alphabetically, Dash Cams appear before ELDs. The user wants ELDs listed first.

## Fix
Update the sort comparator in two places in `src/lib/equipmentExport.ts` so that `eld` always sorts before `dash_cam`:

1. **`buildExportRows`** (line ~71) — used by `eld_dash_cam` CSV and PDF exports.
2. **`buildDriverEquipmentRows`** unassigned section (line ~202) — used by the Drivers + Equipment report.

Replace the generic `localeCompare` on `device_type` with an explicit type-order map: `eld` → `0`, `dash_cam` → `1`. This ensures ELDs appear first in every combined export without affecting single-type exports.

## Files
- `src/lib/equipmentExport.ts` — two sort-comparator edits only.