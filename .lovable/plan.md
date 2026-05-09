## Add Home & Not Dispatched ribbons in a collapsible section

### What changes

In `src/pages/dispatch/DispatchPortal.tsx`, replace the standalone Truck Down banner (lines ~1088–1123) with a single collapsible "Status Alerts" section that stacks three ribbons in this order:

1. **Trucks Down** — destructive red (existing styling preserved)
2. **Home** — `status-progress` color, `Home` icon
3. **Not Dispatched** — muted neutral, `Truck` icon

### Behavior

- **Section header** shows a summary like `Status Alerts · 2 down · 5 home · 8 not dispatched` and a chevron toggle.
- **Default state:** expanded when `truck_down > 0`, otherwise collapsed. Persist user's choice in `localStorage` under `dispatch_status_ribbons_open` so it survives reloads/realtime updates.
- **Each ribbon** keeps the existing Truck Down pattern: icon + count label on the left, wrap-flex of clickable name/unit chips that call `scrollToCard(operator_id)`, and a "View all" link on the right that switches `activeTab` to that status.
- **Hide an individual ribbon** when its count is 0 (e.g. no Home drivers → no Home ribbon). Hide the entire section only when all three counts are 0.
- Truck Down ribbon retains the pulsing siren and red theming; the others use calmer styling (no pulse) but the same row layout.

### Visual layout

```text
┌────────────────────────────────────────────────────┐
│ ▾ Status Alerts · 2 down · 5 home · 8 not dispatched│
├────────────────────────────────────────────────────┤
│ 🚨 2 Trucks Down — [Smith·12] [Jones·07]   View all│
│ 🏠 5 Home          — [chip] [chip] …       View all│
│ 🚚 8 Not Dispatched— [chip] [chip] …       View all│
└────────────────────────────────────────────────────┘
```

### Implementation notes

- Extract a small `StatusRibbon` sub-component inside the same file (kept local — only used here) that takes `{ key, label, count, icon, tone, rows, onViewAll }` to avoid copy-pasting the chip row three times.
- Tone map: `truck_down` → destructive, `home` → status-progress, `not_dispatched` → muted/border.
- Use the existing shadcn `Collapsible` (`@/components/ui/collapsible`) for the wrapper, matching the rest of the app's pattern.
- No changes to data fetching, KPI cards, filter tabs, realtime, chime, or row rendering.

### Out of scope

- KPI cards row (lines ~1125+) stays as-is.
- No changes to the per-card status badges, edit panel, or operator detail dialog.
- No new statuses, no DB or edge-function changes.
