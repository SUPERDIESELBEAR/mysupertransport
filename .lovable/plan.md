## On the correction: there is no second field yet

Checked both the codebase and the live schema before answering.

- `rg "eld_extension_requests"` across the whole repo returns **nothing** — no migration, no edge function, no type, no client call.
- `information_schema.tables` where `table_name ilike '%extension%'` in `public` returns **zero rows**.

So neither of your two outcomes is the case: the modal doesn't write a second record because there is no second record to write. The only extension state that exists is five columns added on `eld_malfunction_events` in migration `20260801214239` — `extension_requested_at`, `extension_granted_at`, `extension_granted_by`, `extension_expires_on`, `extension_notes` — and the ladder's stop condition (`escalationLadder.ts:154`) reads `extension_granted_at` from exactly those. Console write and job read are the same field. There is no divergence to reconcile today.

**But your reasoning about §5 holds, and it changes what the modal should be.** Right now `ELDMalfunctionsPanel.tsx:188-189` stamps `extension_requested_at` and `extension_granted_at` with the *same* `nowIso` — the modal invents a request and grants it in one write, because nothing upstream files anything. That's a grant from nothing, and it is the state that will disagree with `eld_extension_requests` the moment §5 creates that table.

So: **`eld_malfunction_events.extension_granted_at` is the source of truth for the ladder, and it should stay that way.** When §5 lands, the generator owns the request record and the modal shrinks to recording a *response* to a filed request. Concretely, for §5:

- The generator writes the request (its own table or `extension_requested_at`, its choice) — the modal stops writing `extension_requested_at` entirely.
- The grant response continues to write `extension_granted_at` on the event row. The ladder keeps reading one field and never learns about the request table.
- If §5 adds a `status` column, it must be **derived** — either a generated/trigger-maintained mirror of the event's `extension_granted_at`, or read-only in the UI. Two independently-writable liveness flags is the failure you're describing, and the way to avoid it is that only one write path sets granted-ness.

I'll state this in the §5 handoff so its scope reflects it. For this verification pass, step 3 tests one field because one field exists.

---

## The verification pass

### 1. Pause lifecycle, end to end

Reading `process-eld-escalations/index.ts` confirms there is no `resumedEventIds` set and no write that clears `escalations_suppressed_until`. The whole lifecycle is in the pure ladder: `isPaused` (`until >= today`) returns early; `pauseJustLapsed` (`calendarDaysBetween(until, today) === 1`) pushes `pause_lapsed` and returns; from day 2 past expiry, rungs resume.

Fixture: one non-demo open event, real operator with a real profile name (placeholder names hard-fail `P0032`), `discovered_at` positioned so a rung day falls inside the pause.

**Automatic lapse**
1. Pause with a reason and an in-cap expiry; assert reason + expiry persisted, and that an 8-day expiry raises `P0064`.
2. `nowOverride` on a rung day inside the window → assert zero ledger rows for the event.
3. `nowOverride` at expiry + 1 day → assert **exactly one** row, `pause_lapsed`, and **no** `escalation_day` row sharing that `sent_on`. The assertion is keyed to the run's date, not to the ledger as a whole — that's the run boundary.
4. `nowOverride` at expiry + 2 days → the current rung fires, one row.
5. Same-day repeat → no duplicate.

**Manual lift** — separate fixture, same geometry. The lift button clears the column, so both `isPaused` and `pauseJustLapsed` go false and the next run can fire a rung with no lapse notice. Establish the behaviour, then decide: if a rung fires in the same run as the lift, change the lift to set expiry to yesterday rather than nulling, so both triggers converge on `pause_lapsed` + skip.

### 2. Real send failure, read back through the console

Seeded event with `notice_uploaded_at` set, notice pointed at a recipient Resend rejects.

- Assert `notice_send_attempts` incremented **and** `notice_last_send_error` holds a non-empty provider reason.
- Exercise the thrown path too (the `try/catch` added this cycle) — a throw in download/encode/send must record a reason instead of a bare 500.
- Console detail pane: red **"Failing to send"** with attempt count *and* the verbatim reason. Confirm zero-attempt "not yet sent" still renders as its own state.

### 3. Extension suppression, console → job

"Record extension" writes `extension_granted_at`; the ladder reads it. Assert:
- `nowOverride` at day 9+ → no `extension_prompt` row and no past-deadline `escalation_day` row.
- `ack_overdue` stops (same branch).
- Driver dashboard's day-9 blocking notice clears. If that condition doesn't consult `extension_granted_at`, the gate lands with this pass.

## Technical notes

- All fixtures non-demo — demo rows are filtered out of the job's query and would prove nothing.
- Override runs write an `eld_escalation_override_run` audit row and set `is_override = true`, so nothing lands in the console's default evidence-only view.
- Lapse-skip and extension short-circuit also go into `escalationLadder.test.ts` as pure unit tests.
- Scratch events purged after each exercise; no leftover open events in the console.

## Deliverable

Pass/observed-row per assertion, any fix the manual-lift or dashboard-gate checks require, and the one-line §5 handoff note fixing `extension_granted_at` as the ladder's single source of truth.
