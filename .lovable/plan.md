## Goal

Add a "Download" option to the Equipment Inventory page that exports device lists as CSV or PDF, with scope choices for ELDs, Dash Cams, ELDs+Dash Cams, or Fuel Cards. Exports always include all devices of the chosen type(s), ignoring on-screen filters.

## UI

In `src/components/equipment/EquipmentInventory.tsx`, add a **Download** button next to "Add Device" in the header. Clicking it opens a dropdown menu (shadcn `DropdownMenu`) with two grouped sections:

```text
Download
├─ Scope
│  • ELDs only
│  • Dash Cams only
│  • ELDs + Dash Cams
│  • Fuel Cards only
└─ Format
   • CSV
   • PDF
```

Implementation: pick scope, then format — simplest is a two-level menu (scope → submenu format), or a small modal with two radio groups and a confirm button. I'll use the **small modal** approach for clarity (one tap to open, one tap per choice, one Download click) — mobile-friendly and matches the existing modal pattern in this view.

## Export contents

Always pulled fresh from `equipment_items` + open `equipment_assignments` (same query as `fetchItems`), ignoring search/status/type filters. Filtered to selected device types.

Columns (Core + Notes + Dates):
- Device Type (ELD / Dash Cam / Fuel Card)
- Serial Number
- Status (Available / Assigned / Damaged / Lost)
- Assigned Operator (blank if none)
- Notes
- Created Date (US Central, MM/DD/YYYY)
- Updated Date (US Central, MM/DD/YYYY)

Rows sorted by Device Type, then Serial Number.

## CSV

Build in-browser, no new dependency. Proper quoting/escaping for commas, quotes, and newlines. Filename pattern: `equipment-{scope}-{YYYY-MM-DD}.csv` (e.g. `equipment-elds-and-dash-cams-2026-05-20.csv`).

## PDF

Use existing in-app printing path: a new helper `src/lib/equipmentExportPdf.ts` that opens a print window with a styled HTML table (header with SUPERTRANSPORT brand, generated date in Central Time, scope label, summary counts, then the table grouped by device type). Same approach as `src/lib/correctionSummaryPdf.ts` / `src/lib/printDocument.ts` — no new npm packages, browser print-to-PDF.

Filename hint via document title; user saves as PDF from the browser print dialog.

## New files

- `src/lib/equipmentExport.ts` — pure functions: `buildExportRows(items, scope)`, `toCsv(rows)`, `downloadCsv(filename, csv)`, scope label/filename helpers.
- `src/lib/equipmentExportPdf.ts` — `printEquipmentList(rows, scope)` builds and opens print window.
- `src/components/equipment/EquipmentDownloadModal.tsx` — modal with Scope radio group, Format radio group, Download button. Fetches fresh data on open, calls the right helper, closes.

## Edited files

- `src/components/equipment/EquipmentInventory.tsx` — add `Download` button in the header, wire up modal open state.

## Suggestions worth flagging

1. **Include "All devices" as a fifth scope** later if staff want one combined list (BestPass + Fuel Cards + ELDs + Cams). Skipped for now since you didn't request it.
2. **Excel (.xlsx) format** — heavier (needs a library); CSV opens in Excel cleanly, so I'd hold off unless you want true formatted spreadsheets with column widths and freeze panes.
3. **Audit log** of who downloaded what — easy to add if compliance ever asks; not included by default.

## Out of scope

No DB changes, no edge functions, no filter behavior changes, no edits to other equipment modals.
