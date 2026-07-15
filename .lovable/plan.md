## Goal

Replace the awkward global "Download History" flow with a per-driver download that lives on each driver's dispatch card. Selecting a date range and downloading happens inline, scoped to that one driver.

## Why the current button "doesn't function"

The toolbar button does open the modal, but the modal opens a **new browser tab** with the printable view. In the installed PWA (and often with pop-up blockers), that new tab is silently blocked — so nothing appears to happen. Screenshot (PNG) works because it's a direct download.

We'll fix both issues by moving the action onto the card and using a direct download path (no new tab).

## Changes

### 1. New component: `src/components/dispatch/DriverHistoryDownloadPopover.tsx`
- Small popover triggered by a `History` icon button on the driver card footer.
- Contents: From/To date inputs (default: last 30 days), a compact status legend, and two buttons: **PNG** and **PDF**.
- On PNG: fetches this driver's rows from `dispatch_daily_log`, renders a single-driver card offscreen with `html-to-image`, downloads `dispatch-history-<Last-First>-<from>_to_<to>.png`.
- On PDF: builds the same single-driver HTML and triggers browser print via a hidden iframe (no new tab, no pop-up blocker). User picks "Save as PDF" in the print dialog.
- Reuses the card markup, legend, and status metadata already in `DispatchHistoryExportModal.tsx` — extracted into a shared helper `src/components/dispatch/dispatchHistoryRender.ts` so both the per-driver popover and the existing bulk modal stay in sync.

### 2. `src/pages/dispatch/DispatchPortal.tsx`
- Add the `DriverHistoryDownloadPopover` to the card footer action row (lines ~1817-1907), between Binder and Message, using a `History` lucide icon labeled "History".
- Remove the top-toolbar **Download History** button and its modal wiring (lines ~1491 and ~2491), since the per-driver flow supersedes it. `DispatchHistoryExportModal.tsx` and its imports get deleted.

### 3. Table view parity
- Add the same History action to the per-row action cluster in the table view so dispatchers using the dense layout have the same capability.

## Technical notes

- Data fetch is identical to today (`dispatch_daily_log` filtered by `operator_id` + date range), just scoped to one driver.
- PDF path switches from `window.open` to a hidden `<iframe>` + `contentWindow.print()` to bypass pop-up blocking inside the PWA. This is the root cause of "button does not function."
- No schema, RLS, or edge-function changes.

## Files touched

```text
src/components/dispatch/DriverHistoryDownloadPopover.tsx   (new)
src/components/dispatch/dispatchHistoryRender.ts           (new, shared markup)
src/pages/dispatch/DispatchPortal.tsx                      (add per-card action, remove toolbar button)
src/components/dispatch/DispatchHistoryExportModal.tsx     (delete)
```
