## Technical details

No database change. `dispatch_daily_log.log_date` already accepts any date; nothing constrains it to the past, and the reason columns went live with the accepted draft.

`src/components/dispatch/MiniDispatchCalendar.tsx`
- `applyRange` (~line 317): drop the `effectiveEnd = min(rangeTo, today)` clamp and the "Nothing to mark" guard that depends on it; build the date list straight from `rangeFrom`–`rangeTo`. Keep a one-year-ahead ceiling.
- The To-date input's `max={today}` (~line 487) becomes today + 1 year; From gets the same ceiling.
- `syncTodayToLive` stays gated on `toWrite.includes(todayStr)`, so a purely future range leaves `active_dispatch` untouched.
- The `dispatch_status_history` write stays limited to today, as now.
- Footnote text changes from "Future days are skipped" to note that future days are saved as planned.
- The single-day popover gains the same future allowance so one planned day is possible too.

`src/lib/absenceLog.ts`
- `summarizeAbsence` gains a `plannedDays` total and excludes future dates from `offRoadDays` / `byReason`. Split by a passed-in `today` string so the helper stays pure and testable.
- `groupAbsenceStretches` unchanged — a future stretch groups exactly like a past one; a `planned` flag is derived per stretch from `start > today`.

`src/components/dispatch/AbsenceLogPanel.tsx`
- Planned stretches render with a "Planned" pill and sit above the historical list.
- `resolveRange` presets end at today, so add planned days to the fetch window when a preset is active (query `to` extended to the range's own end or today + 1 year for "all").

`src/test/absence-log.test.ts` — new cases: planned days excluded from off-road totals, a stretch spanning today splits its counting correctly, planned flag derivation, the one-year ceiling.

Verification: the absence-log and dispatch-day-log test files, typecheck, then a browser check that a future range saves, shows as Planned, and leaves today's board status unchanged.
