# Fix Dispatch Board Status Drift

David Wambolt's case showed the dispatch board can drift out of sync with the latest `dispatch_daily_log` entry. This plan applies a three-part fix so the board always reflects the most recent log on or before today.

## Root Cause Recap

- `rollover-dispatch-status` cron only promotes rows where `log_date = today` (Chicago).
- When a driver skips days (no log entry for today), the cron does nothing and the board keeps the old `active_dispatch.dispatch_status`.
- A driver can also enter a `truck_down` log dated in the past; if today has no entry, the board never picks it up.

## Fix

### 1. Promote-on-insert trigger (real-time)
Add a trigger on `dispatch_daily_log` (AFTER INSERT OR UPDATE) that:
- Finds the latest `log_date <= today (Chicago)` for that operator.
- If the row being written IS that latest row, update `active_dispatch.dispatch_status`, `current_load_lane`, `status_notes`, `updated_at` to match.
- Skips if a newer-dated log already exists (so back-dated edits don't override more recent reality).
- SECURITY DEFINER, idempotent, no-op when values already match.

This means a staff entry of `truck_down` for "yesterday" immediately corrects the board.

### 2. Carry-forward in nightly rollover (safety net)
Update `supabase/functions/rollover-dispatch-status/index.ts`:
- Change query from "logs where `log_date = today`" to "latest log per operator where `log_date <= today` (Chicago)".
- Promote that latest status to `active_dispatch` if different.
- Keeps the cron as a self-healing backstop even if the trigger ever misses (e.g. direct SQL writes).

### 3. One-time backfill
Run a one-shot data update via the insert tool:
- For every operator, set `active_dispatch.dispatch_status` (and related fields) to the latest `dispatch_daily_log` row where `log_date <= today` (Chicago).
- Only touch rows where the current value differs from the latest log, so audit history stays clean.
- This immediately corrects David Wambolt and any other drifted drivers.

## Files Touched

- New migration: trigger + function on `dispatch_daily_log`.
- Edge function edit: `supabase/functions/rollover-dispatch-status/index.ts` (carry-forward logic).
- One-time `UPDATE` via insert tool for backfill.
- `public/version.json` bump.

## Out of Scope

- No UI changes.
- No changes to how drivers create log entries.
- No change to the cron schedule itself (still runs 12:05 AM Central).

## Verification

After deploy:
1. Re-query David Wambolt — `active_dispatch.dispatch_status` should be `truck_down`.
2. Spot-check 2–3 other operators with old `active_dispatch.updated_at` but newer `dispatch_daily_log` rows.
3. Insert a test `dispatch_daily_log` row (dated today) and confirm `active_dispatch` updates instantly via the trigger.
