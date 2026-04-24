

## Roster-level rollup chip — show unlogged-day gaps at a glance

### What you're getting

Two additions to the **Dispatch Hub roster** so missing-day gaps are visible without clicking into each driver:

1. **Per-driver amber chip** on each roster row — shows count of unlogged days in the **last 7 days**.
2. **Single total chip** in the Dispatch Hub header — sum of all gaps across all included drivers.

Both hide automatically when the count is 0, so the roster stays clean when everyone is caught up.

### Walkthrough

```text
Dispatch Hub                    [ 8 unlogged across fleet ]
─────────────────────────────────────────────────────────
 ✓  Rudolph Ellis     Unit 102   [Dispatched]
 ?  James Fleshman    Unit 087   [Home]         [ 5 unlogged ]
 ?  Ryan Martinez     Unit 091   [Truck Down]   [ 3 unlogged ]
 ✓  Sarah Connor      Unit 044   [Dispatched]
─────────────────────────────────────────────────────────
```

- **Per-row chip:** small amber pill (`bg-amber-100 text-amber-700 border-amber-400`) — same color family as the calendar's "?" glyph, so it visually links to the calendar view.
- **Click behavior:** clicking the per-row chip opens that driver's Dispatch tab; the existing B feature inside `MiniDispatchCalendar` then auto-scrolls/opens the first gap.
- **Header total chip:** sums all per-driver counts; clicking it does nothing (informational only) — keeps the click target unambiguous.
- **Window:** rolling **last 7 days** (excludes today and future). A driver with 47 ancient gaps doesn't drown out the actionable recent ones.
- **Respects existing rules:**
  - **Excluded operators** (per `mem://features/dispatch/excluded-from-dispatch`) are skipped — no chip, not counted in the header total.
  - **Go-live anchor** — uses the same logic we just built (`go_live_date` for app-onboarded drivers, `'2026-04-01'` legacy fallback, then `created_at`). A driver who went live 3 days ago can show at most 3 unlogged days, not 7.

### Files touched

- `src/pages/dispatch/DispatchPortal.tsx` — extend `fetchDispatch` to also pull `dispatch_daily_log` rows for the last 7 days + each operator's `onboarding_status.go_live_date` and `created_at`. Compute per-driver unlogged counts; render the per-row chip and the header total chip.

### Technical notes

- **Data fetch:** in `fetchDispatch`, after building the included roster, run one batched query:
  ```ts
  supabase.from('dispatch_daily_log')
    .select('operator_id, log_date')
    .in('operator_id', includedIds)
    .gte('log_date', sevenDaysAgoStr)
    .lt('log_date', todayStr);
  ```
  Build a `Map<operator_id, Set<log_date>>` and compute `unloggedCount = max(0, eligibleDays - loggedDays)` where `eligibleDays` = number of past days (excluding today) in the 7-day window that are **on or after** that operator's anchor date.
- **Anchor resolution:** add `created_at` and `onboarding_status(go_live_date)` to the existing `operators` select. Reuse the same `LEGACY_DISPATCH_START = '2026-04-01'` constant pattern from `MiniDispatchCalendar.tsx` (export it from there or duplicate — duplicate is fine for now to keep changes scoped).
- **State:** add `unloggedCountMap: Record<operator_id, number>` to component state, derived once per `fetchDispatch` run. Header total = `Object.values(unloggedCountMap).reduce(...)`.
- **Realtime:** the existing `operators` realtime subscription stays as-is. Add a lightweight refresh of the unlogged map when `fetchDispatch` runs (already triggered on the existing realtime channel and the polling refresh).
- **Click-to-jump:** per-row chip click reuses the existing per-row "open driver" navigation already in the file (the chip just sits inside the row's existing click area — a separate `<button>` with `stopPropagation` isn't needed if we route through the existing row handler).
- **Chip in card view AND table view:** Dispatch Hub has both `viewMode: 'cards' | 'table'`. Render the chip in both layouts so toggling views doesn't lose the signal.

### Out of scope

- Backfill tooling, notifications to dispatchers, or auto-defaulting missed days — still not building.
- Per-dispatcher rollup ("Leo Wallace's drivers have 14 gaps total") — say the word later if you want it; trivial follow-up once per-driver counts exist.

