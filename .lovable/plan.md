## Problem

In Management → Compliance → Cards view, each driver card shows CDL / Med Cert / IRP rows with: colored dot, doc badge, expiration date, then a cluster of action chips (Stale, History, Upload, Remind, CertPill). At current card widths the date (e.g. "Mar 22, 2026") is truncated to "Mar 22, 2…" because the date sits inside a `flex-1 min-w-0 truncate` span while the trailing action chips consume the remaining width.

## File

`src/components/inspection/InspectionComplianceSummary.tsx` — `CertSubRow` component (lines ~930–948), used only by the Cards view.

## Fix

Restructure `CertSubRow` into two rows so the full date always shows:

Row 1 (identity + date, never truncated):
- status dot
- doc badge (`CDL` / `Med Cert` / `IRP (cab card)`)
- date via `DriverDateEditor`, wrapped in `shrink-0 whitespace-nowrap tabular-nums` (no `flex-1`, no `truncate`)
- push `CertPill` to the far right with `ml-auto` (keeps the ✓/⚠ status pill visible on the same line as the date)

Row 2 (compact actions):
- `StaleChip`, `HistoryButton`, `UploadButton`, `RemindButton` grouped with `flex items-center gap-1.5` and small top margin (`mt-1`)

Keep `LastUpdatedLine` beneath both rows as today.

No changes to `ListCertSubRow`, the fleet card, the list view, data flow, or any business logic — this is purely a layout fix scoped to the Cards row.

## Verification

1. Open Management → Compliance → toggle to **Cards**.
2. Confirm every driver card shows full dates: `Mar 22, 2026`, `Aug 2, 2027`, `Nov 3, 2028`, etc. — no ellipsis.
3. Stale/History/Upload/Remind icons appear on a second row, still clickable.
4. Toggle to **List** view — unchanged.
5. Resize to md and xl breakpoints (2- and 3-column grids) — no overflow.
