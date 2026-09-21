## What changes

1. **Reading days (calendar)** — one shared helper does the read: try the full select, and on the "column does not exist" error retry with only the long-standing fields, treating the reason as empty. Days, statuses and colours then load exactly as they did before.
2. **Reading the Absence Log panel** — same helper, same fallback. Until the draft is accepted the log lists off-road stretches by status with no reason label instead of showing nothing.
3. **Saving a day or a range** — the new reason / who / when fields are stripped from the write when the field isn't present, so clicking a status on the calendar still works today. Saving a reason is disabled with a short hint in that state.
4. **Nothing else moves** — the staged additive column, the enum, the grouping helper, the panel layout and the button names all stay as approved. The moment the draft is accepted the fallback stops firing on its own.

## Technical notes

- `MiniDispatchCalendar.fetchLogs` and `AbsenceLogPanel` currently select `absence_reason` (and `notes_by, notes_at`); PostgREST answers 42703 and both receive zero rows, which is why the calendar paints "unknown".
- Add `src/lib/dispatchDayLogs.ts`: `fetchDispatchDayLogs(operatorId, from, to)` returning `{ logs, hasReasonColumn }`, with the 42703 retry, plus `stripAbsenceFields(payload, hasReasonColumn)` for the upserts in `setStatus` and `applyRange`.
- Unit-test the helper against both shapes (with and without the column) in `src/test/absence-log.test.ts`.
- Then: typecheck, full suite `--maxWorkers=4`, pass report under `docs/passes/`, dated entries in `docs/tms-build-status.md` and `docs/tms-wish-list.md`.
