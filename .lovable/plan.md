## §4 Walkthrough — Steps 3A–7 (revised)

Step 3 is already complete and verified. This plan covers keying a second demo day, then steps 4–7.

### Step 3A — key and certify 2026-07-31 (new)
Driver session (preview-session handover for demo operator `ee993ec0`, Marcus Mueller).

Key a log for **2026-07-31** that is materially different from 2026-08-01 so no later assertion can pass by matching the wrong row:
- **Header**: different truck #, trailer #, shipping doc / BOL, co-driver blank vs. set, different from/to cities and total miles than the 08-01 log.
- **Segments**: a different count and shape — e.g. 00:00–05:30 Off Duty, 05:30–07:00 On Duty, 07:00–12:15 Driving, 12:15–13:00 Off Duty, 13:00–18:30 Driving, 18:30–24:00 Sleeper — versus 08-01's three blocks.

Certify it as the driver. Assert by query: row exists for 2026-07-31, `status = certified`, `locked = true`, `supersedes_day_id IS NULL`, no `rods_amendments` rows, and its header/segment values differ from `b64f2429`.

### Step 4 — decline path (against 2026-07-31)
Staff raise a second correction request against the newly certified 2026-07-31 day. The amended 2026-08-01 chain stays untouched as the actioned example.

Driver declines with a written response. Assert live:
- request row stores the written response, status `declined`
- `resolved_by_day_id IS NULL`, not closed
- 2026-07-31 stays `certified`, `locked`, unamended (`supersedes_day_id IS NULL` on all rows for that date, zero `rods_amendments`)
- decline visible on the staff-side request row

### Step 5 — offline no-op replay
Replay the step 3 certification of `b64f2429` with the **same** certification token. Assert:
- `replayed: true`
- no second `rods_amendments` row (count still 4)
- request `a97cf4b8` unchanged — `resolved_at` and `resolved_by_day_id` identical to step 3 values

### Step 6 — policy audit + driver-session immutability (hardest gate)
Read `pg_policies` live for `rods_days`, `rods_events`, `rods_amendments`. Report the **exact** observed policy list, SELECT policies included, so the read-only shape is visible rather than asserted. Confirm no INSERT/UPDATE/DELETE policy exists for management, owner, dispatcher, onboarding_staff, and that `is_own_rods_operator` is the only write path.

Behavioural checks:
- Management session: cannot certify, amend, or edit a day.
- **Driver session, the one that matters**: `UPDATE` and `DELETE` against a `locked = true` day and its events → **zero rows affected and no error**. RLS filters before the lock trigger runs, so the certified record must be invisible to writes from the only role holding write policies. Any error raised, or any non-zero row count, fails step 6 and stops the walkthrough.

### Step 7 — snapshot, then purge
Write the final state into `docs/eld-certification-playwright-run.md` **before** purging — the snapshot now covers **four** `rods_days` rows, not three:
1. `689eb664` (2026-08-01 original, superseded, locked)
2. `b64f2429` (2026-08-01 amendment, certified, locked)
3. the 2026-07-31 day (certified, locked)
4. HARNESS-1's day
Plus: `rods_amendments` rows with `original_day_id`, both correction requests with dispositions, and every notification row spawned.

Then purge through `purge-rods-day`, amendments before the originals they supersede (the continuity guard refuses an original whose amendment still points at it). Remove both correction requests, HARNESS-1, the 2026-08-01 chain, the 2026-07-31 day, and the notifications. Confirm zero rows across each touched table.

### Failure rule
Any failing assertion stops the walkthrough at that step and is reported as-is — no continuing, no cleanup that destroys the evidence.

### Technical notes
- All assertions by live query against rows, never by UI success messaging.
- Driver writes go through a preview-session Playwright handover; the sandbox `psql` role cannot write `rods_days`.
- Preview session tokens expire in ~3 minutes; re-mint per phase.
