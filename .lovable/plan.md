## Consumers of the completeness predicate

`isComplete` in `rodsTypes.ts` is RODS-specific and has three client consumers. The other `isComplete` hits in the grep (`PipelineDashboard`, `OperatorDetailPanel`, `OperatorStatusPage`, `OnboardingChecklist`, `PEScreeningTimeline`) are unrelated local variables in the onboarding surfaces — different predicate, not touched.

**Display counts only:**

1. `useRodsDays:42` → `completeCount` / `reconstructionComplete`. Consumed at `RodsView:187` to show or hide the amber "Reconstruction incomplete" panel and its "N of 8 days still need a log" line.
2. `ReconstructionWizard:36` → progress bar and "N of 8 days complete".

Both are counters. Syncing counts as complete in both, for the reason given: the driver signed it.

**One state-ish consumer:**

3. `ReconstructionWizard:88` keys the per-day button off `chip.state`: `complete` → **View**, `in_progress` → **Continue**, `needed` → **Fill in this day**. Not a lock — the editor's own `day.locked` decides editability — but the label is a promise. A locally-certified day is locked on the device, so **View** is correct for `syncing`; **Continue** would offer an edit the editor will refuse.

`RodsView:195` "Reconstruct my logs" is gated only by `!reconstructionComplete`, i.e. by the same counter. Nothing else unlocks a next step, closes the wizard, or suppresses a prompt on this predicate. The wizard closes on the driver's back action, not on completion.

**Fourth consumer, server-side, and it does gate a prompt:**

`supabase/functions/rods-certification-reminders/index.ts:93-107` computes its own `completeCount` from Postgres — `status === 'certified'` — and branches: reconstruction incomplete → `rods_reconstruction_reminder`; otherwise → "Your paper log for {date} is not certified yet."

This job cannot see `local_certified_at`; it reads the database only. So a driver whose certification is still in the queue is, from the job's side, uncertified. In the normal case the queue drains in seconds and this never fires. In the stalled case it does: the driver gets nagged to certify a log he signed and that the office refused.

That is a real defect but it is **not** the one under repair here, and it should not be fixed by teaching the job about device state — it can't have that state. The right answer is that a stalled day is already surfaced by `StalledLogBanner` and its `eld_sync_alerts` row, so the office knows; the reminder is redundant noise rather than a wrong instruction. The plan adds an inline comment at `supabase/functions/rods-certification-reminders/index.ts` around line 93 with that reasoning, so the next person editing the job sees it before rediscovering it.

## Chip precedence

Confirmed and specified: failure ranks above syncing. `rodsChip` gains its states in this order, first match wins:

1. `sync_rejected` — the office refused this log. Red, action wording, and the code from item D carried through so dispatch has something to quote.
2. `sync_stalled` — signed here, sync chain went terminal. Amber, matching the `StalledLogBanner` already on the page.
3. `syncing` — locally certified, server row not yet `certified`. Green, "Certified — signed on this device, syncing".
4. Server `certified` — plain "Certified" / "On file (ELD log)".
5. `draft` → "In progress"; absent → "Needed".

A rejected or stalled day is still **complete** for the counters — the driver signed it and cannot un-sign it, so it does not belong in "N days still need a log", and the failure banner is what asks him to act. `chip.state` for both is `complete`, so the wizard button reads **View**. The distinction lives in the label and colour, which is where the driver reads it.

## The work

### A. Live-RPC certification test, both arms

New DB-backed test, `PGHOST`-gated, with a boxed skip banner in the same register as `definer-live-catalog.test.ts` — naming this file, saying the certification write path was not exercised, and saying a green run without it is not evidence.

- *Original arm.* One keyed day, segments tiling 1440, all 12 header fields, real legal name. Assert `status = 'certified'`, locked, legal name recorded, and the four totals matching the segments.
- *Amendment arm.* Certify, build a correction draft, amend, certify again. Assert the totals recompute on the amendment row, the original flips to `superseded`, and both land in one transaction.

Segments chosen so all four buckets are distinct and non-zero. Provisions and tears down its own operator and days.

### B. Mirror comment in the parity file

Header comment on `serverGuardOutcome` in `parityFixtures.test.ts`: it models certify's guard sequence, it does not represent the write arm, and acceptance is proved by the live test in A.

### C. Split server class by HTTP status

`classifyError` returns `deterministic: true` alongside `server` for an unrecognised 4xx; the runner reads it to pick a short attempt allowance instead of the full `SERVER_ATTEMPT_LIMIT`. 5xx, 429 and transport failures are unchanged. Class, alert kind, and `markDayStalled` are unchanged — the flag narrows only the delay before a human sees it.

### D. Certify failure must speak

- Recognised SQLSTATE in `REJECTION_SQLSTATES`: existing rejection copy.
- Unrecognised: plain copy saying the office did not accept the log, that it was not the driver's mistake, and to contact dispatch — carrying the code.

### E. One event, one sentence — and the second affirmative moment

- Delete the `navigator.onLine` branch at `RodsDayEditor.tsx:272`. One string for the local commit: signed and locked on this device, on its way to the office.
- `useRodsDays` overlays the Dexie `rods_days_cache` (`local_certified_at`, `unsynced`, `sync_stalled`, `sync_rejected`) onto the Postgres rows; `rodsChip` gains the five-way precedence above. `RodsDayStrip`, `ReconstructionWizard` and `RodsDayEditor` all read `rodsChip`, so all three pick the states up without further change.
- Second affirmative moment when the `certify_rods_day` entry succeeds — the office has the log on file — delivered on the same surface as D's failure copy.
- `isComplete` treats `syncing`, `stalled` and `rejected` as complete, per the reasoning above.

### F. Conventions line

`rods_events.duty_status` is `integer` 1–4 matching the federal form's line numbering (1 off duty, 2 sleeper, 3 driving, 4 on duty). `dutyStatusLabel()` is the only mapping. SQL comparing it to `'off_duty'`/`'driving'` raises 22P02 at runtime — nothing catches it statically.

### G. Inline comment in the reminder job

Add a comment at `supabase/functions/rods-certification-reminders/index.ts` around line 93 where `completeCount` is computed from `status === 'certified'`. It states: this job reads Postgres only, cannot see `local_certified_at`, so a driver whose certification is stalled in the queue will be reminded to certify a log he already signed; not fixable inside the job; `StalledLogBanner` and `eld_sync_alerts` already surface the case to the driver and office.

## Then

Resume the §4 walkthrough at step 2 — staff correction request, bell render assertion, amend and decline paths, the offline no-op replay, the policy audit, cleanup. HARNESS-1 and the `2026-08-01` demo day stay until then.

## Technical notes

- The overlay is a `rods_days_cache` read keyed by `log_date`, merged over the server rows; `StalledLogBanner` and `CorrectionRequestBanner` already use that table.
- `rodsChip`'s `eld_document` branch is untouched — uploads certify on the driver's own ELD and never enter this queue.
- `RodsChipState` keeps the new failure states as labels only, but all failure states map to `state: 'complete'` so the existing three-way button logic keeps working.
