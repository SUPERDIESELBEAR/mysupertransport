## Add "days in status" to Trucks Down, Home, and Not Dispatched

### What changes

In `src/pages/dispatch/DispatchPortal.tsx`, compute how long each driver has been in their current status, then surface that duration on the three ribbon chips and on the matching driver cards. Sort each ribbon and the card list (within those three statuses) by longest streak first.

### Data source

- Use `dispatch_status_history` (already queried). For each operator, the streak start = the earliest `changed_at` in the most recent contiguous run where `dispatch_status` equals their current status.
- Algorithm per operator: walk history rows newest → oldest; the streak start is the `changed_at` of the oldest row whose status matches the current status before the chain breaks.
- Fallback when no history rows exist for the operator: use `active_dispatch.updated_at`. If that is also missing, show no duration (omit the badge).
- Recompute whenever `rows` or the history dataset changes; the existing realtime subscriptions on `active_dispatch` and `dispatch_status_history` already trigger this.

### Display format (smart short)

- Less than 24 hours since streak start: `Today` (with hover tooltip showing exact start timestamp in US Central time).
- 1–6 days: `Xd` (e.g., `3d`).
- 7+ days: `Xw Yd` (e.g., `2w 3d`); omit the day part when 0 (`2w`).
- Tooltip on every badge shows the full streak start in US Central, e.g., `Since May 6, 2026 8:14 AM CT`.

### Visual treatment

- Ribbon chips: append the duration to the right of the existing name/unit text, separated by a thin divider dot, e.g. `Smith·12 · 3d`. Use the chip's existing tone (no new color), but render the duration in a slightly muted weight so the name stays primary.
- Driver cards (only for cards whose status is `truck_down`, `home`, or `not_dispatched`): add a small inline badge next to the existing status badge, e.g., `Truck Down · 5d`. Use the same tone classes already applied to that status (destructive / status-progress / muted) so it reads as part of the status, not a new field.
- Cards in `dispatched` status are unaffected.

### Sorting

- Within each of the three ribbons, sort chips by streak length descending; ties break by operator last name ascending.
- In the main card grid, extend the existing priority sort: keep the status order (`truck_down → not_dispatched → home → dispatched`), but inside each of the three flagged statuses, sort by streak length descending (ties → last name). `dispatched` keeps its current ordering.

### Visual layout

```text
Status Alerts · 2 down · 5 home · 8 not dispatched          [v]
  2 Trucks Down   [Smith·12 · 5d]  [Jones·07 · 2d]              View all
  5 Home          [Lopez·22 · 1w 2d]  [Patel·18 · 4d]  ...      View all
  8 Not Dispatched[Nguyen·05 · 9d]  [Khan·14 · 3d]  ...         View all
```

### Implementation notes (technical)

- Add a helper `computeStreaks(history, rows): Map<operatorId, { since: Date }>` that runs once per render of the derived data and is memoized with `useMemo` keyed on `history` length + `rows.map(r => r.id+r.dispatch_status).join()`.
- Add a `formatStreak(since: Date): { short: string; tooltip: string }` util colocated in the file.
- Extend the chip render in the existing ribbon loop to render `{name}·{unit} · {streak.short}` with a `title={streak.tooltip}` attribute (or `Tooltip` if already used nearby — use plain `title` to avoid new imports).
- Add a `streakBadge` next to the card status badge in the existing card render block; only render when the card's status is one of the three flagged values and a streak exists.
- Update the existing card sort comparator to break ties within the three flagged statuses by `streakSince` ascending (older = longer = first).
- No changes to data fetching beyond what is already loaded; no schema changes; no edge function or DB changes.

### Out of scope

- "Days in status" for `dispatched` cards.
- Persisting or displaying historical streaks (previous runs).
- Alert thresholds, color escalation by age, or notifications based on streak length.
- Changes to the collapsible header summary line, KPI cards, edit panel, or detail dialog.
