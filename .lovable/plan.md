## Goal
Fix the two-click "View" detour on the PEI Queue and add a stitched combined-history PDF for the selected driver.

## Changes

### 1. Row "View" opens the specific employer's PEI Record directly
In `src/components/pei/PEIQueuePanel.tsx` (line ~735):
- Replace the per-row Eye button's `onClick={() => onOpenApplication?.(r.application_id)}` (which opens the full applicant drawer and forces the user to hunt for the same employer and click View again).
- Instead, load the full `PEIRequest` row by `r.request_id` (via `fetchPEIRequestById` in `src/lib/pei/api.ts` — add if missing; otherwise a small `supabase.from('pei_requests').select('*').eq('id', ...).single()` inline) and open `PEIResponseViewer` (the "PEI Record — [employer]" modal from screenshot 2) directly.
- Mount `<PEIResponseViewer open={...} request={...} onClose={...} />` inside `PEIQueuePanel` so the record can be shown without leaving the queue.
- Rename the row button "Open" → "View" with the Eye icon (matches user's language and screenshot 1).

### 2. Add a per-driver "Open PEI panel" button (the sidebar drawer)
On the driver group header row in `PEIQueuePanel.tsx` (the collapsible header that shows applicant name + "N employers" — around lines 568–600), add a small button next to the existing controls:
- Label: **"Open PEI panel"** with the `ShieldCheck` icon.
- Handler: existing `onOpenApplication?.(group.applicationId)` — the same behavior the row Eye button used to trigger, which routes through `ManagementPortal` → `PEIQuickDrawer` → `ApplicationPEITab` (screenshot 3).
- Placed on the header so it's discoverable whether the group is expanded or collapsed; `e.stopPropagation()` to avoid toggling the collapse.

### 3. Add a "Combined history PDF" button (Print / Download all)
Two placements, same handler:
- On the driver group header row in `PEIQueuePanel.tsx` next to "Open PEI panel": **"Print full history"** (Printer icon).
- Inside `src/components/pei/ApplicationPEITab.tsx` header row next to "Auto-build" (line ~273–275): same button.

Implementation:
- New helper `src/lib/pei/combinedHistoryPrint.ts` that:
  1. Fetches every `pei_requests` row for the applicant (already in scope via the queue rows or a targeted query).
  2. For each request, fetches `pei_responses`, `pei_accidents`, and `pei_request_events` (reuses `fetchPEIResponse`, `fetchPEIAccidents`, `fetchPEIRequestEvents` from `src/lib/pei/api.ts`).
  3. Reuses the existing `buildPrintHtml` logic already in `PEIResponseViewer.tsx` — export it from that file (or extract to `src/lib/pei/printRecord.ts`) so both the single-record print and the combined print share one template.
  4. Concatenates the per-employer sections into one HTML document with a cover page ("Previous Employment Investigations — {Applicant Name}", generated date, employer count) and `page-break-before: always` between records. All employers stitched into one PDF as requested.
  5. Opens a popup window, writes HTML, calls `window.print()` — same pattern as the current `handlePrint` in `PEIResponseViewer` (with the same popup-blocked toast fallback).
- User can Save as PDF from the browser print dialog (standard browser behavior; no server PDF renderer needed).

### 4. Wiring
No changes needed to `PEIQuickDrawer.tsx` — the existing `onOpenApplication` prop path from `ManagementPortal` still opens it for button #2.

## Result
- One click on a row's View → that employer's PEI Record opens (screenshot 2).
- One click on the driver header's "Open PEI panel" → full applicant PEI sidebar (screenshot 3).
- One click on "Print full history" (in queue header or sidebar) → stitched multi-employer PDF ready to print or Save-as-PDF.

## Technical notes
- Reuse `PEIResponseViewer` and its `buildPrintHtml` — no duplicate rendering logic.
- No schema/RLS changes; all data already accessible via existing PEI API helpers.
- Combined print inherits the same print CSS (audit trail, GFE section, response fields) already validated for single records.
