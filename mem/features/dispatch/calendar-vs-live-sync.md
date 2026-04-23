---
name: Calendar vs live dispatch sync
description: Rules keeping the MiniDispatchCalendar daily log and the active_dispatch live tiles in lockstep, including dual-write and Mark-range tool
type: feature
---
The Dispatch Hub uses two related tables:
- `dispatch_daily_log` — historical journal, one row per operator per day. Powers the MiniDispatchCalendar grid + per-day counters.
- `active_dispatch` — single-row-per-operator live status. Powers the Dispatch Portal tiles (Total Active / Dispatched / Home / Truck Down / Not Dispatched).

**Dual-write rules (must stay in sync):**
1. **Calendar today-cell** (`MiniDispatchCalendar.setStatus`) — when `dateStr === today`, after writing `dispatch_daily_log`, also `upsert` `active_dispatch` and insert a `dispatch_status_history` row via `syncTodayToLive`. Skip the live writes if the new status equals the current `active_dispatch.dispatch_status` (prevents spurious history rows + duplicate notifications). Past days only write `dispatch_daily_log`.
2. **Dispatch Portal dropdown** (`DispatchPortal.saveEdit`) and **bulk action** (`applyBulkStatus`) — after writing `active_dispatch`, also `upsert` today's row in `dispatch_daily_log` on conflict `(operator_id, log_date)`.

**Mark range tool** (`MiniDispatchCalendar`) — per-operator popover with From/To dates, status, and "Overwrite existing" toggle. Future days are always skipped. If the range includes today AND today was written, also dual-writes to `active_dispatch` + history.

**Required unique index:** `dispatch_daily_log_op_date_uniq ON dispatch_daily_log (operator_id, log_date)` — needed for the upserts above.

**Excluded operators** (`operators.excluded_from_dispatch = true`) — MiniDispatchCalendar shows an empty-state notice instead of the grid; calendar writes never happen. The reconciliation/backfill SQL also filters them out.

**Today-cell visual cue:** gold ring (`ring-1 ring-gold/60`) + `title="Setting status here also updates the live Dispatch Hub"` on hover.
