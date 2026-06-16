## Problem

The `Compliance Alerts` panel header packs the title, badges, doc-type filter chips, the `Within N days` picker, and three bulk-action buttons (`Send Reminders to All`, `Mark All Renewed`, `Remind Uncontacted`) onto a single non-wrapping flex row. On a ~1000px-wide laptop viewport the items collide and visibly overlap (see screenshots). The panel is shared, so it appears on both the Management → Compliance page and the Driver Hub page.

## Fix (single file: `src/components/inspection/ComplianceAlertsPanel.tsx`)

Restructure the header (lines ~414–570) so it wraps cleanly instead of overflowing. Purely presentational — no logic, no removed controls.

1. Outer header `div`: change `flex items-center px-4 py-3 gap-2` → `flex flex-wrap items-center px-4 py-3 gap-2`.
2. The expand/collapse title `<button>` (currently `flex-1 … min-w-0`): keep `min-w-0` but drop `flex-1`, instead use `flex-1 min-w-[260px]` so it can shrink and still grow on wide screens while letting the action cluster drop to a new line when there's no room.
3. Wrap the right-side cluster (window picker + three bulk-action blocks + the small collapse chevron at line 567) in a new container:
   `<div className="flex flex-wrap items-center justify-end gap-2 ml-auto">…</div>`
   This keeps the buttons grouped, lets them wrap as a unit to a second row on narrow widths, and preserves their existing alignment on wide widths.
4. Doc-type filter chip row (lines 469–494): add `flex-wrap` so the chips themselves wrap rather than push the title text out of the row when the title area is narrow.

No changes to:
- `ComplianceWindowPicker`, `useComplianceWindow`, or any business logic.
- `DriverRoster.tsx` / `InspectionComplianceSummary.tsx` (the row-level overlap the user describes is the same panel header on both pages — fixing the shared component covers both).
- The alert table rows below the header (those already use a responsive flex layout with `hidden sm:block` columns and are not the source of the overlap).

## Verification

After the edit, screenshot the preview at the user's ~1021px width on both the Management → Compliance page and the Driver Hub page to confirm the header wraps without overlap and still looks correct at desktop widths.
