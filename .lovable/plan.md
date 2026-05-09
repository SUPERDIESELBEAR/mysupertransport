## Fix streak source: use dispatch_daily_log as the truth

### Problem

The "days in status" badge currently derives its streak start from `dispatch_status_history`. For drivers whose history was only partially backfilled (e.g., Makiethian James has just one backfill row dated 2026-04-23), the streak shows shorter than reality. The actual truth lives in `dispatch_daily_log`, which has continuous per-day rows. For Makiethian: `truck_down` daily rows go back to 2026-04-09, so today (2026-05-09) the streak should read `4w 2d`, not `2w 2d`.

### Fix

Switch the streak computation in `src/pages/dispatch/DispatchPortal.tsx` to use `dispatch_daily_log` as the primary source, and only fall back to `dispatch_status_history` / `active_dispatch.updated_at` when daily log rows are missing.

### Algorithm

For each operator currently in `truck_down`, `home`, or `not_dispatched`:

1. Query `dispatch_daily_log` for that operator, ordered by `log_date DESC`, limited to a reasonable window (e.g., 365 rows = up to a year).
2. Walk newest → oldest. Skip any rows with `log_date > today` (US Central). Starting from today's row (or the most recent row ≤ today), include consecutive days where:
   - `status === current dispatch_status`, AND
   - the date is exactly one day before the previous included date (no gaps).
3. The streak start = earliest `log_date` in that contiguous run (anchored at noon US Central using the project's standard `T12:00:00` parsing).
4. Streak length in days = (today_local − streak_start_local) + 1, so a single same-day row reads `1d` and the badge shows `Today` only when the run hasn't begun (no log row yet today).
5. Fallback (no daily_log rows at all for this operator): keep the existing behavior — earliest contiguous `dispatch_status_history` match, then `active_dispatch.updated_at`.

### Display change

- Update `formatStreak` to take an integer `days` count instead of a timestamp, since daily_log is day-granular:
  - `1d`, `2d`, …, `6d`
  - `7+`: `Xw` or `Xw Yd`
  - Keep tooltip: `Since Apr 9, 2026 (31 days)`.
- Drop the `Today` label entirely — daily log rows make every flagged driver at least `1d`.

### Out of scope

- Backfilling `dispatch_status_history` from `dispatch_daily_log`.
- Changing the calendar, ribbons layout, or any other behavior.
- Streaks for `dispatched` cards.

### Technical notes

- One batched query: `select operator_id, log_date, status from dispatch_daily_log where operator_id in (...) and log_date >= today - 365 order by operator_id, log_date desc`.
- Group rows by operator_id in JS, then run the gap-walking algorithm per operator.
- "Today" in US Central: format `now()` as YYYY-MM-DD via `toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })`.
- Re-run the query whenever `rows` changes (same trigger as today). The per-minute tick stays for cosmetic refresh.
