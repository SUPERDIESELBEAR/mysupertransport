

## Sync calendar ↔ live dispatch + one-time backfill + range tool

Three changes in one rollout:

1. **Dual-write going forward** — calendar's today-cell and the dropdown each keep both tables in sync.
2. **One-time backfill** — silently reconcile the existing mismatch (Makiethian James → Truck Down).
3. **Backfill Range** — a small "Mark date range" tool inside the calendar so dispatchers can paint April 1 → yesterday quickly.

### 1. Dual-write logic (no more drift going forward)

**`src/components/dispatch/MiniDispatchCalendar.tsx` — `setStatus`**
When the day being set is **today**, after the `dispatch_daily_log` upsert also:
- `upsert` `active_dispatch` (`operator_id`, `dispatch_status`, `updated_by`, `updated_at`) on conflict `operator_id`.
- Insert a `dispatch_status_history` row.
- Skip both writes if the new status equals the current `active_dispatch.dispatch_status` (prevents spurious history rows + duplicate notifications).
- Skip entirely when operator is excluded (already returns early via the empty state).

Past days only write to `dispatch_daily_log` (history journal — unchanged).

**`src/pages/dispatch/DispatchPortal.tsx` — `saveEdit` & `confirmBulkAction`**
After writing `active_dispatch`, also `upsert` today's row into `dispatch_daily_log` (`operator_id`, `log_date = today`, `status`, `created_by`) on conflict `(operator_id, log_date)`. So toggling via the dropdown leaves a calendar trace for today automatically.

**Today-cell visual cue (calendar)**
- Add `ring-1 ring-gold/60` (replacing the existing `ring-primary/40`) on today's button.
- Add `title="Setting status here also updates the live Dispatch Hub"` for hover tooltip.

> Requires a unique index on `dispatch_daily_log (operator_id, log_date)` for `upsert` — included in the migration.

### 2. One-time backfill (runs in the migration, no UI)

The migration includes:

```sql
-- Ensure upsert target exists
CREATE UNIQUE INDEX IF NOT EXISTS dispatch_daily_log_op_date_uniq
  ON public.dispatch_daily_log (operator_id, log_date);

-- Reconcile latest calendar status -> active_dispatch for any drift
WITH latest AS (
  SELECT DISTINCT ON (operator_id) operator_id, status, log_date
  FROM public.dispatch_daily_log
  WHERE log_date <= CURRENT_DATE
  ORDER BY operator_id, log_date DESC
)
INSERT INTO public.active_dispatch (operator_id, dispatch_status, updated_at)
SELECT l.operator_id, l.status, now()
FROM latest l
JOIN public.operators o ON o.id = l.operator_id
WHERE o.is_active = true AND o.excluded_from_dispatch = false
ON CONFLICT (operator_id) DO UPDATE
SET dispatch_status = EXCLUDED.dispatch_status,
    updated_at = now()
WHERE active_dispatch.dispatch_status IS DISTINCT FROM EXCLUDED.dispatch_status;

-- Mirror to history for audit
INSERT INTO public.dispatch_status_history (operator_id, dispatch_status, status_notes)
SELECT l.operator_id, l.status, 'Backfill: synced from calendar latest entry'
FROM latest l
JOIN public.operators o ON o.id = l.operator_id
JOIN public.active_dispatch ad ON ad.operator_id = l.operator_id
WHERE o.is_active = true AND o.excluded_from_dispatch = false
  AND ad.dispatch_status = l.status
  AND ad.updated_at > now() - interval '5 seconds';
```

After this runs, **Makiethian James** moves from `not_dispatched` → `truck_down` and immediately joins the Trucks Down tile. (Confirmed exactly one operator currently affected.) No "Sync" pill in the UI — the migration handles it cleanly and the dual-write prevents recurrence.

### 3. Backfill Range tool (inside the calendar)

Above the calendar grid in `MiniDispatchCalendar.tsx`, add a small **"Mark range"** button → opens a Popover:

```text
┌─ Mark date range ───────────────────┐
│  From: [Apr 1 ▾]   To: [Apr 22 ▾]  │
│  Status: ● Dispatched               │
│          ● Home                     │
│          ● Truck Down               │
│          ● Not Dispatched           │
│  ☐ Overwrite existing entries       │
│           [ Cancel ]  [ Apply ]     │
└─────────────────────────────────────┘
```

Behavior:
- Two date inputs (native `<input type="date">` for speed — no calendar-in-calendar UX).
- Defaults: From = first of currently-displayed month, To = today.
- Status pick = same four options as the day-cell popover.
- **Overwrite** off (default) → only fills blank days. On → replaces existing entries. Either way, never touches future days.
- On Apply: build the date list, fetch existing logs for the range once, partition into insert/update sets, run `upsert` to `dispatch_daily_log`. If the range includes **today**, also dual-write to `active_dispatch` + history (same rule as a single click).
- Disable the button (with tooltip) when operator is excluded.
- Toast on success: *"Marked 22 days as Truck Down for Bobby Thompson."*

### Files touched

```text
supabase/migrations/<new>.sql                               [unique index + backfill SQL]
src/components/dispatch/MiniDispatchCalendar.tsx            [today dual-write, gold ring,
                                                             "Mark range" popover + apply logic]
src/pages/dispatch/DispatchPortal.tsx                       [saveEdit & confirmBulkAction:
                                                             also upsert today's daily_log]
mem://features/dispatch/calendar-vs-live-sync               [NEW — explains the rules]
```

### What you'll see after deploy

- **Trucks Down tile immediately reflects Makiethian** — no click needed. The migration syncs him.
- **Calendar today-cell** has a gold ring + tooltip; setting it auto-updates the live tiles.
- **Dropdown** auto-stamps today on the calendar — the two surfaces stay in lockstep forever.
- **"Mark range" button** sits above the calendar; one popover paints April 1 → today for an operator in 4 clicks (date, date, status, Apply).

### Out of scope

- No automatic backfill of `active_dispatch` on **future** calendar updates — only today is "live."
- No bulk "mark range across all operators" — per-operator only.
- The per-day calendar counters at the bottom remain a true history count.

