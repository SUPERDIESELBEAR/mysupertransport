# Compliance Alerts — true column alignment

## What's wrong
Each alert row in `ComplianceAlertsPanel.tsx` is its own independent CSS grid. Grid tracks are computed per container, so every row sizes its columns from its own content:

- The first and last tracks are `auto` — the actions cell has a variable extra pill ("36d ago", "1d ago", or nothing), so its width changes row to row.
- The operator track is `minmax(180px,1fr)`, so it absorbs whatever space is left over — a different amount in each row.

Result: the Med Cert pill, expiry date, and status pill land at a slightly different x-position on every line, exactly as in the screenshot. The header row is a third separate grid, so it drifts too.

## Fix
Make the header and all rows share one set of column tracks.

1. Wrap the header + all rows in a single parent grid that owns the column definition (the existing `gridCols` string).
2. Render the header and each row as `grid grid-cols-subgrid col-span-full`, so they inherit the parent's tracks instead of computing their own. Row backgrounds, hover states, the left border accent, and dividers stay intact.
3. Replace the two `auto` tracks with fixed widths so nothing can stretch:
   - urgency dot: `12px`
   - actions: a fixed track wide enough for the "Nd ago" pill + Remind + Renew + Open, reserved even when the pill is absent so the buttons line up.
4. Keep the operator track as `minmax(180px,1fr)` — with shared tracks it is now identical on every row.
5. Keep every existing responsive breakpoint (Expires hidden below sm, Last Action below md, Last Reminded / Last Renewed below xl, Never Renewed badge below md) and all data, sorting, reminder, renew, and bulk-action behavior unchanged.

## Verification
Open Driver Hub > Compliance Alerts and confirm the Med Cert pills, expiry dates, status pills, and action buttons each form one straight vertical column, with header labels sitting directly above their columns. Re-check at mobile, tablet, and wide widths.