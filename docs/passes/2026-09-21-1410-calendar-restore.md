# Pass — Driver Status calendars restored (column-tolerant day reads)

Date: 2026-09-21 14:10 UTC · Mode: BUILD · Draft: var_01m31zfbdhe9faa5va8k1a0xnh

## The fault

The Absence Log pass (2026-09-21 13:35) made both readers select `absence_reason`
(and, in the panel, `notes_by, notes_at`). Those columns only exist after the
staged additive migration is accepted, so PostgREST answered 42703 and returned
**no rows at all**. Every driver card's mini calendar therefore had an empty
`logs` array and painted every day "unknown" (`?`, no status colour) for the
current month and every month back. No data was lost or deleted — the
`dispatch_daily_log` rows were untouched throughout.

## The fix

`src/lib/dispatchDayLogs.ts` (new) — one column-tolerant reader:

- `fetchDispatchDayLogs(operatorId, from, to, { order })` tries the full select,
  and on a missing-column error (`42703` / "column ... does not exist") retries
  with `id, log_date, status, notes` only, reporting `hasReasonColumn: false`.
  Both select lists are module-level literals so the repo's select scanner can
  read them statically (first attempt failed that guard; fixed).
- The outcome is remembered module-wide, so after the first miss later month
  changes take a single round trip. Any *other* error is surfaced, never
  swallowed and never retried.
- `stripAbsenceFields(payload, hasReasonColumn)` drops the three staged fields
  from writes while they do not exist, so marking a day or a range still works
  today.

Wired into `MiniDispatchCalendar` (reads, `setStatus`, `applyRange`, plus the
reason pickers disabled with a one-line note while the columns are absent) and
into `AbsenceLogPanel` (same reader, `order: 'desc'`). No change to the staged
migration, the enum, the grouping helpers, the panel layout, or the button
names. The fallback self-clears the moment the draft is accepted.

## Proof

- `src/test/dispatch-day-logs.test.ts` (new, 7 tests): full-shape read; 42703
  retry returning the days with a null reason; cached miss taking one round
  trip; a non-missing-column error surfaced as-is; both strip cases.
- Live check, owner session, `/dashboard?view=dispatch` (Playwright screenshot
  `/tmp/browser/cal/dispatch.png`): calendars render Dispatched green, Home
  amber, Truck Down red again; per-card counters non-zero (e.g. 12 / 9 / 0 / 0);
  "Absence Log" present on every card; no `absence_reason` console error.
- Typecheck clean. Full suite `--maxWorkers=4`: 207 files, 2,046 passed.

## Failures NOT caused by this pass

- `grant-parity-live` — `permission denied for function grant_parity_report`
  for the harness psql role. Pre-existing, recorded 2026-09-21 13:35, still open.
- `definer-live-catalog` (2 assertions) — the live trigger function
  `public.enforce_driver_deactivation_permission()` is EXECUTE-able by `anon`
  and `authenticated` and is not in the 2026-08-01 inventory. Not created by
  this pass (driver deactivation was explicitly out of scope) and not fixable
  from a draft, which may not run DDL. Reported, not touched — needs its own
  pass to revoke EXECUTE from the client roles.
- `accessorial-approval-rules` failed once on the first full run and passes on
  re-run (live-DB flake).

## Files authored

- `src/lib/dispatchDayLogs.ts` (new)
- `src/test/dispatch-day-logs.test.ts` (new)
- `src/components/dispatch/MiniDispatchCalendar.tsx` (edited)
- `src/components/dispatch/AbsenceLogPanel.tsx` (edited)
- `docs/passes/2026-09-21-1410-calendar-restore.md` (this report)
- `docs/tms-build-status.md`, `docs/tms-wish-list.md` (dated entries)
