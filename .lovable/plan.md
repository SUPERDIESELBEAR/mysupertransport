# §4 Walkthrough — Steps 3 through 7

## Confirmed starting state (read live, just now)

- `rods_days` for demo operator `ee993ec0`, log date 2026-08-01:
  - `689eb664-34d0-446a-b20d-fa8b2a0b9a09` — status `certified`, `locked = true`, certified 2026-08-02 01:54:53Z, `is_demo = true`
  - `b64f2429-2f70-45ef-8517-4df72d175e92` — status `draft`, `locked = false`, `supersedes_day_id = 689eb664…`, `amendment_reason` NULL
- `rods_correction_requests`: exactly one row, `a97cf4b8-6c7b-42a8-aaa8-6176ff9a82a9`, status `open`, against `689eb664…`, issue names the **14:00–15:00 driving segment misclassified as on-duty**. `resolved_at`, `resolved_by_day_id`, `driver_response` all NULL.
- `rods_amendments`: zero rows.
- Amendment reason is stored on `rods_days.amendment_reason`; per-field rows live in `rods_amendments (rods_day_id, original_day_id, field_path, old_value, new_value, reason)`.

## Step 3 — amend and certify

Drive the driver session in Playwright: open amendment draft `b64f2429`, reclassify the 14:00–15:00 segment from on-duty to driving, enter the written amendment reason, sign and certify.

Assertions, each by SQL against live rows (not UI chips):
- `certify_rods_day` response contains `replayed: false`.
- `689eb664` → status `superseded`, `locked` still true.
- `b64f2429` → status `certified`, `certified_at` set, `amendment_reason` equal to the text entered.
- `rods_amendments`: exactly one row per changed field, every row with `original_day_id = 689eb664…`, `rods_day_id = b64f2429…`, and matching `reason`. Count asserted against the diff.
- `a97cf4b8` → status `actioned`, `resolved_by_day_id = b64f2429…`, `resolved_at` non-null.

Also read the sync queue's `last_error` and the banner state to confirm the three previously-blocking defects are gone: reason persisted, queue drained, failure surfaces as a readable rejection rather than a green chip.

## Step 4 — decline

Raise a second correction request as staff against a **different** log date for the same demo operator. As the driver, decline with a written response.

Assert: the row carries the `driver_response` text, `status = 'declined'`, `resolved_at` / `resolved_by_day_id` remain NULL, the targeted day stays `certified` with no new `rods_amendments` rows and no new superseding `rods_days` row, and the staff request row renders the decline.

## Step 5 — offline no-op replay

Re-submit the step 3 certification through the offline queue with the same certification token.

Assert: `replayed: true`; `rods_amendments` count unchanged; `a97cf4b8` retains its step 3 `resolved_at` (not re-stamped); `b64f2429.certified_at` unchanged.

## Step 6 — policy audit

Report the full observed `pg_policies` list for the three tables. Live read already shows:

```text
rods_days
  SELECT  Drivers read own rods days            is_own_rods_operator(operator_id)
  SELECT  Staff read all rods days              is_staff(auth.uid())
  INSERT  Drivers insert own rods days          WITH CHECK is_own_rods_operator AND locked = false
  UPDATE  Drivers update own unlocked rods days USING is_own_rods_operator AND locked = false
  DELETE  Drivers delete own unlocked rods days USING is_own_rods_operator AND locked = false
rods_events
  SELECT  Drivers read own rods events / Staff read all rods events
  INSERT/UPDATE/DELETE  Drivers …unlocked rods events (via parent day, locked = false)
rods_amendments
  SELECT  Drivers read own rods amendments      is_own_rods_operator(operator_id)
  SELECT  Staff read all rods amendments        is_staff(auth.uid())
  (no INSERT, UPDATE or DELETE policy at all — writes only via SECURITY DEFINER certify_rods_day)
```

No write policy references management, owner, dispatcher or onboarding_staff; `is_own_rods_operator` is the only write path. Re-read at run time rather than quoted from here.

Behavioural checks:

1. **Driver against a locked day — the check that proves immutability.** With the demo driver's own session, run UPDATE and DELETE against `689eb664` (`locked = true`) and against its `rods_events` rows. Confirm **zero rows affected and no error**: the policy's `locked = false` predicate filters the rows out before the lock trigger ever fires, so a certified record is silently immutable to the only role that holds write policies at all. Assert the row count returned is 0 and that the day's `status`, `locked` and `certified_at` are byte-identical before and after.
2. **Management refused.** With a management session, attempt to certify, amend and edit a day. Reported for completeness, but noted as the weaker of the two: management has no write policy on these tables to begin with, so refusal is the absence of a grant rather than evidence that the lock holds.

## Step 7 — snapshot, then purge

**Snapshot first.** Append the final state to `docs/eld-certification-playwright-run.md`: the three `rods_days` rows with statuses and lock flags, every `rods_amendments` row with `original_day_id`, both correction requests with dispositions and response text, and the notification rows spawned by steps 3–5. Written and verified on disk before anything is deleted.

**Then purge**, in dependency order, through `purge-rods-day`:
1. amendment day `b64f2429` (and the step 4 day if one was created) — before the originals they supersede, since the continuity guard refuses an original whose amendment still points at it
2. original `689eb664` and the 2026-08-01 demo day
3. both correction requests, HARNESS-1, and every notification the steps spawned

Confirm zero rows in each touched table (`rods_days`, `rods_events`, `rods_amendments`, `rods_correction_requests`, `notifications` for the demo operator).

## Failure handling

If any step's assertion fails, stop at that step and report the live row state and the readable error. No purge, no cleanup — the evidence stays.

## Technical notes

- All assertions issued as SQL against live rows; UI success states are treated as unverified.
- The driver-session write attempts in step 6 must run under the driver's JWT claims (not a superuser connection), or the policy predicate is bypassed and the check proves nothing.
- Playwright drives both the driver PWA and a management session at `localhost:8080`; the demo operator session is restored from the injected managed session.
- Nothing in application code is expected to change; if a defect resurfaces, the fix is proposed separately rather than patched mid-run.
