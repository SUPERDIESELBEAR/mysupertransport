# Fix PEI Print — Full Record

## Problem

In **Management → Applications → Driver PEI**, clicking **Print** on the PEI Response Viewer only prints what's currently visible inside the dialog. The dialog uses `max-h-[90dvh] overflow-y-auto`, so `window.print()` captures the scroll viewport — anything scrolled out of view is clipped from the printout.

## Root Cause

`PEIResponseViewer.tsx` calls `window.print()` directly while the record lives inside a scroll-clipped Radix dialog. Browsers print the live DOM at its rendered size; the overflow container truncates everything past the visible region.

## Fix

Replace the in-place `window.print()` with a **dedicated print window** approach:

1. Build a self-contained HTML document containing the complete PEI record (header, all sections, accidents, audit trail) using the already-loaded `response`, `accidents`, `events`, and `request` state.
2. Open a new browser window (`window.open('', '_blank')`), write the HTML + minimal print-friendly CSS, then call `print()` on that window and close it on `afterprint`.
3. Keep the existing toast fallback for popup-blocker or cross-origin failures, pointing users to ⌘P / Ctrl+P.

This guarantees the full record prints regardless of the dialog's scroll position and also produces a cleaner printout (no app chrome, dialog backdrop, or button bar).

## Files Touched

- `src/components/pei/PEIResponseViewer.tsx` — rewrite `handlePrint` to render the full record into a new window; extract a small `buildPrintHtml(request, response, accidents, events, applicantName)` helper in the same file. No other files affected.

## Out of Scope

- No changes to data fetching, schema, or other portals' print buttons.
- No new dependencies.

## Verification

1. Open a PEI record with a long audit trail or many accidents so the dialog scrolls.
2. Scroll partway, click **Print** — the print preview should show **all** sections (Applicant header → Audit Trail), not just the visible slice.
3. Try with a GFE-documented request — the GFE block should print instead of the response sections.
4. Confirm popup-blocker case still shows the existing toast.
