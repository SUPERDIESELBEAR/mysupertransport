## Part 1 — E: rename to `LogSyncBanner`, three states

Move `src/components/operator/rods/StalledLogBanner.tsx` to `LogSyncBanner.tsx`, update the two imports (`RodsDayEditor.tsx:30`, `RodsView.tsx:27`) and both call sites (`:381`, `:200`). The component's job becomes "report this day's sync state" — honest about all three things it reports rather than one of them.

States:

- **stalled** — existing copy, `AlertTriangle`, unlock affordance. Unchanged.
- **rejected** — existing copy for a recognised SQLSTATE; new plain copy for an unrecognised one (item D), carrying the code.
- **confirmed** — the office has the log. Green, one affordance: dismiss.

**`confirmed` is dismissed explicitly, and only explicitly.** No timer, no mount-marks-itself-seen, no scroll heuristic. It appears when the cached day flips from locally-locked-and-unsynced to server-certified — the queue drained — and it stays there, across reloads and across sessions, until the driver taps to dismiss. `sync_confirmed_seen_at` is written to the day's Dexie cache entry at that tap and nowhere else; once written the banner never returns for that day. A driver who was driving when the queue drained finds the confirmation waiting for him, which is the case that justified the banner over a toast in the first place.

The docblock gets one sentence so the next person doesn't reimplement "seen":

> The confirmed state is cleared by an explicit dismiss tap only — never by a timer, a mount, or a visibility heuristic — because a driver whose queue drained while he was driving must find the confirmation still there when he next opens the app.

Steady state for a certified day is still no banner, so the failure states don't inherit blindness from a green row nobody reads.

## Part 2 — `test:guards`, and what it honestly is

The query-lint column checks are inside `postgrestEmbeds.test.ts` (`it('selects no column that does not exist on the table it is read from')`, line 183, alongside the FK-hop check at 212 and the regression pin at 243). There is no separate fifth suite — four files.

`package.json`:

```
"test:guards": "vitest run src/test/definer-search-path.test.ts src/test/policy-grant-parity.test.ts src/lib/__tests__/postgrestEmbeds.test.ts src/test/definer-live-catalog.test.ts"
```

`docs/database-security-conventions.md`, a section above the numbered rules rather than inside one:

> **Post-migration step.** Every turn that authors a migration ends by running `npm run test:guards` in that same turn. Not before a commit — before the turn ends, because the turn is the unit of work that exists here.

And, as its own observation in that section:

> **These guards do not run on their own.** `definer-search-path`, `policy-grant-parity` and the column/embed checks in `postgrestEmbeds` were each written after a class of silent failure had already shipped, each is correct, and none is wired to anything that runs automatically. There is no CI, there are no git hooks, and git is platform-managed — so there is nowhere to hang them. That is a structural property of this setup, not a lapse by whoever wrote them. Do not assume a green session means they ran.

Plus a project-memory entry so the step survives into sessions that never open the doc. This does not remove the memory dependency; it reduces it to one command tied to one trigger, and writes down that the guards are manual.

## Part 3 — the rest, as approved

- **A** — rewrite `src/test/rods-live-certification.test.ts`: PGHOST-gated loud skip banner in the `definer-live-catalog` shape; provisions and tears down its own operator fixture instead of the production identities it has been using; both arms (initial certification, superseding amendment); asserts four distinct non-zero derived-total buckets so a call that returns but records nothing fails; `duty_status` as integers 1–4 per Rule 6; `BEGIN … ROLLBACK` kept as a second line of defence rather than the only one.
- **B** — header comment on `serverGuardOutcome` in `parityFixtures.test.ts`: models certify's guard sequence, does not represent the write arm, acceptance is proved by A.
- **C** — confirm `runner.ts` reads `deterministic` for the shortened attempt allowance (`classify.ts:87` already sets it); extend `retryBudget.test.ts` to pin the 429/5xx/transport arm as unchanged. Class, alert kind and `markDayStalled` untouched — only the delay narrows.
- **D** — recognised SQLSTATE keeps its `REJECTION_SQLSTATES` copy; unrecognised gets plain copy carrying the code: the office did not accept the log, it was not the driver's mistake, contact dispatch. Rendered by `LogSyncBanner`'s rejected state.
- **E overlay half** — confirm `useRodsDays` and `useRodsDay` overlay `rods_days_cache` onto the Postgres rows on every consumer path. The five-way chip precedence, `isComplete`, and the removal of the `navigator.onLine` branch are already landed.
- **F** — Rule 6 already in the doc. No edit.
- **G** — code comment at `supabase/functions/rods-certification-reminders/index.ts:93`: reads Postgres only, cannot see `local_certified_at`, will remind a driver about a log he has already signed when the queue is stalled, not fixable inside the job, and `LogSyncBanner` plus the `eld_sync_alerts` row already cover it. No `docs/open-items.md`.

## Verification

`npm run test:guards`, plus the ELD suites touched (`retryBudget`, `parityFixtures`, `displayCopy`, `classify`) and the rewritten `rods-live-certification`. `PGHOST` is set here so the live arms actually run; elsewhere the banner prints and the file is not evidence.

## Then — resume the §4 walkthrough at step 2

Against HARNESS-1 and the 2026-08-01 demo day: raise the staff correction request and confirm it reaches the driver's bell, drive the amend path to auto-close, drive the decline path, replay an offline certify entry and assert the auto-close is a no-op, audit that management roles stay read-only on RODS data, then clean up the harness and the demo day.
