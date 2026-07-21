## Goal

Restructure the Compliance Alerts card (only) so its header, filter row, bulk toolbar, and row grid all align on the same predictable tracks as the Remind / Renew / Open action columns. Follow the "Grid-aligned toolbar" direction you selected: distinct horizontal bands, bulk buttons pinned to a right-side cluster with uniform geometry, filter chips on their own row, and per-row Operator cell simplified so table columns start at the same x-position on every row.

## Scope

- File touched: `src/components/inspection/ComplianceAlertsPanel.tsx` only.
- No data, handler, edge-function, or DB changes. No changes to the tiles above (9 / 12 / 13) or to Compliance Summary below.
- All existing controls preserved: shield icon, title, red count, Never Renewed pill, N Reminder Sent pill, expired/window caption, bell, Within-30-days picker, Send Reminders to All, Mark All Renewed, Remind Uncontacted, filter chips (All / CDL / Medical Cert / No Action), and every table column + per-row Remind / Renew / Open button.

## New layout (adapted to Superdrive tokens)

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Band A: [icon] Compliance Alerts (6)   [Never Renewed] [5 Reminder Sent]     │
│                                                    🔔  [Within 30 days ▾]    │
├──────────────────────────────────────────────────────────────────────────────┤
│ Band B: 2 expired · CDL or medical cert…            [Send][Mark][Remind]     │
│         [All 6][CDL 1][Medical Cert 5][No Action 1]  ↑ 3 buttons, equal w    │
├──────────────────────────────────────────────────────────────────────────────┤
│ Table (unchanged columns, sticky header preserved from earlier work)         │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Band A — Identity + scope (single line, `justify-between`)
- Left cluster: shield-in-tile, "Compliance Alerts", red count pill, then the two status pills (`Never Renewed`, `N Reminder Sent`) on the same line at fixed height `h-6`.
- Right cluster: bell icon + `ComplianceWindowPicker` only.
- No wrapping into or out of this band; both clusters stay pinned to their edges.

### Band B — Filters (left) + bulk toolbar (right), `flex items-end justify-between`
- Left column, stacked:
  1. Muted caption "N expired · CDL or medical cert expiring within N days".
  2. Filter chips (All / CDL / Medical Cert / No Action) as one segmented control on a `bg-muted/40` rail so they read as a unit and always sit on their own row.
- Right column: the three bulk buttons in a `grid grid-cols-3 gap-2`, each button `w-[140px] h-9`, `text-xs font-semibold`, uppercase-optional. Buttons keep their current color language: Send Reminders (destructive tint), Mark All Renewed (status-progress tint), Remind Uncontacted (muted tint). "Last sent" sublabels sit under the two applicable buttons in a fixed `min-h` slot so button tops never shift.

### Row grid — stabilize the Operator cell
- Operator cell becomes single-line: urgency dot • driver name (truncate) • doc-type chip pinned to a fixed slot (`w-[92px]`) so the Expires column starts at the same x-position on every row.
- The "Never Renewed" per-row pill moves out of the Operator cell and stacks under the Expired/Nd-left badge inside the Status column (small sub-pill). This mirrors the direction's tidy Operator column while keeping "Never Renewed" visible.
- Header widths adjusted to match the new Operator + Status slots so column labels sit directly above their data. Sticky header behavior (from the Fleet Compliance work) is preserved.

## Style mapping to project tokens

- Destructive red / gold / status-complete green kept using existing `hsl(var(--destructive))`, `hsl(var(--gold))`, `hsl(var(--status-complete))`, `hsl(var(--status-progress))`, `hsl(var(--warning))` tokens — no new hex values, no dark-mode changes.
- Card container keeps `border-destructive/30 bg-destructive/5`.
- Band separators use `border-b border-destructive/10`.
- Button heights normalized to `h-9` in the bulk cluster and `h-8` for per-row Remind / Renew / Open (already aligned — untouched).

## Out of scope

- No changes to Compliance Summary, the 9/12/13 tiles, Fleet Compliance list/table, or any other page.
- No new pagination footer (the prototype showed one, but the existing card doesn't paginate — kept as-is).
- No copy edits beyond the header re-layout; labels stay identical.
