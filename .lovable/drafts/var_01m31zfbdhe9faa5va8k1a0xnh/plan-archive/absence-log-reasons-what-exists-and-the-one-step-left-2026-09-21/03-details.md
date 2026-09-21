## Where it appears

- **Cards view** — the calendar day popover: status buttons, reason select, note
  box. The Range tool takes the same pair, so a whole week is one entry. The
  "Absence Log" dropdown under the calendar shows the log.
- **Table view** — the button under the driver's name and phone opens the same
  panel.

## Technical notes

Staged migration `20260921130000_absence_log_reasons.sql` (additive, applies on
accept): `absence_reason` enum (`truck_down`, `home_time`, `vacation`,
`medical`, `personal`, `waiting_on_load`, `no_driver`, `other`) plus
`dispatch_daily_log.absence_reason`, `notes_by`, `notes_at`, and an
`(operator_id, log_date DESC)` index. Existing RLS and grants already cover new
columns on that table.

Code already in the draft: `src/lib/absenceLog.ts` (reason list, validation,
`groupAbsenceStretches`, totals, range presets), `AbsenceLogPanel.tsx`,
reason/note controls in `MiniDispatchCalendar.tsx`, and the column-tolerant
reader `src/lib/dispatchDayLogs.ts` that keeps today's calendars working and
strips the staged fields from writes until the column exists. That fallback
self-clears on accept.

Changing a day's reason also writes a row to `dispatch_status_history`, and the
today-sync puts `"<Reason> — <note>"` into the live dispatch record so the
existing truck-down alert and history download keep reading it.

Not in scope: showing reasons to drivers, any settlement effect, the Parked
control.

## If you want more than this

Say so and I will extend the plan — for example a reason breakdown per driver
per month, an export of the log, or extra reasons in the list.
