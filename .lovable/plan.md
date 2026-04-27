# Plan: Daily rollover sync for active dispatch status

## Problem
At midnight Central, a new "today" begins on the MiniDispatchCalendar but the Dispatch Board cards (`active_dispatch`) keep showing yesterday's status until someone manually edits the card or re-clicks today on the calendar. Anthony Carlone is the textbook case: today's calendar cell already says **dispatched**, but his card still says **truck_down** because the dispatched status was pre-filled days ago for a future date.

## Solution
Add a scheduled edge function that runs every morning at **00:05 America/Chicago** and promotes each operator's `dispatch_daily_log` row for the new "today" into `active_dispatch` — exactly the same dual-write the calendar already performs when staff click today's cell.

## How it works

```text
00:05 CT cron tick
        │
        ▼
  rollover-dispatch-status (edge function)
        │
        ├─ Resolve "today" in America/Chicago → YYYY-MM-DD
        │
        ├─ SELECT operator_id, status FROM dispatch_daily_log
        │     WHERE log_date = today
        │     AND operators.excluded_from_dispatch = false
        │
        └─ For each row:
              ├─ Skip if active_dispatch.dispatch_status already matches
              ├─ UPDATE active_dispatch SET dispatch_status, updated_at, updated_by=NULL
              └─ INSERT dispatch_status_history (notes: 'Daily rollover from calendar')
```

Operators **without** a today-row in `dispatch_daily_log` are left untouched — the card keeps yesterday's value, which is the safest default and matches today's UX.

## Steps

1. **Edge function `rollover-dispatch-status`** (new, scheduled)
   - Uses `SUPABASE_SERVICE_ROLE_KEY` so it can write across all operators.
   - Computes today in `America/Chicago` (matches existing timezone policy).
   - Pulls today's `dispatch_daily_log` rows joined to `operators` filtering out `excluded_from_dispatch = true`.
   - For each operator, compares to `active_dispatch.dispatch_status`; if different, updates `active_dispatch` and inserts a `dispatch_status_history` row with note "Daily rollover from calendar".
   - Returns `{ checked, promoted, skipped }` for log visibility.
   - `verify_jwt = false` in `supabase/config.toml` so cron can hit it.

2. **Cron schedule** (via insert tool, not migration — contains URL/anon key)
   - Enable `pg_cron` and `pg_net` if not already enabled.
   - Schedule `'5 5 * * *'` UTC (= 00:05 CT during CDT) — note: we'll document the DST caveat. Alternative: run twice (`'5 5 * * *'` and `'5 6 * * *'`) and let the function's idempotency (skip-if-equal) make the second one a no-op. **Recommended: the twice-daily approach** so DST transitions never miss a day.

3. **One-time backfill for today**
   - After deploy, immediately invoke the function once to fix Anthony and any other operators currently out of sync.

4. **Memory update**
   - Append a note to `mem://features/dispatch/calendar-vs-live-sync.md` documenting the new automated rollover so future work doesn't reintroduce the gap.

## What this does NOT change
- No UI changes — calendar, cards, and Mark-range tool keep their current behavior.
- The existing `syncTodayToLive` dual-write in `MiniDispatchCalendar` stays as the realtime path for same-day edits.
- No changes to `dispatch_daily_log` schema.

## Edge cases handled
- **Excluded operators** (`excluded_from_dispatch = true`) are filtered out — same rule as the calendar.
- **No today-row** → no change to the card.
- **Status already matches** → skipped, no history row, no notification noise.
- **DST** → twice-daily schedule guarantees one fires after local midnight year-round.
- **`active_dispatch` row missing** → upserted to today's status (rare, but safe).

## Verification after deploy
- Manually invoke the function and confirm Anthony's `active_dispatch.dispatch_status` flips from `truck_down` → `dispatched`.
- Check `dispatch_status_history` shows the rollover row.
- Tomorrow morning: confirm cron fires (Postgres logs) and the Dispatch Board reflects today's calendar values without any human action.
