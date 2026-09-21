## Where it lives

- **Cards view** — the day popover on each driver's mini calendar, the Range
  tool for a stretch of days, and the "Absence Log" dropdown below the calendar
  for reading it back.
- **Table view** — the button under the driver's name and phone opens the same
  Absence Log panel.
- The log has a month / quarter / year / all-time picker plus a custom from–to
  range, and a one-line total of days off the road with a breakdown by reason.
  Consecutive days with the same reason collapse into one row; a gap or a change
  of reason starts a new row.

## Who can enter and edit

Dispatch and management, exactly as they reach the Driver Status page today — no
new permission gate. Drivers do not see the reasons.

## Technical notes

Staged migration `20260921130000_absence_log_reasons.sql` (additive, applies on
accept): `absence_reason` enum (`truck_down`, `home_time`, `vacation`,
`medical`, `personal`, `waiting_on_load`, `no_driver`, `other`) plus
`dispatch_daily_log.absence_reason`, `notes_by`, `notes_at`, and an
`(operator_id, log_date DESC)` index. The table's existing `notes` column holds
the comment. Existing RLS and grants already cover new columns.

Already in the draft: `src/lib/absenceLog.ts` (reason list, `canSaveAbsence`
enforcing a comment for Other, `groupAbsenceStretches`, totals, range presets),
`src/components/dispatch/AbsenceLogPanel.tsx`, the status/reason/comment
controls and Range tool in `MiniDispatchCalendar.tsx`, and the column-tolerant
reader `src/lib/dispatchDayLogs.ts` that keeps today's calendars painting and
strips the staged fields from writes until the field exists — it self-clears on
accept.

Edits are upserts on `(operator_id, log_date)`, so re-saving a day replaces its
reason and comment and restamps `notes_by` / `notes_at`; the change also writes a
row to `dispatch_status_history`, and the today-sync puts `"<Reason> — <note>"`
into the live dispatch record so the truck-down alert and history download keep
reading it.

Not in scope: driver-facing visibility, any settlement effect, the Parked
control.
