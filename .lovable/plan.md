## Part A — close the twelve unisolated notification paths

One migration. Every function keeps its current behaviour; only the notification insert changes.

**The ten triggers.** Wrap each `INSERT INTO public.notifications` in `BEGIN ... EXCEPTION WHEN OTHERS`, and on failure call `log_notification_delivery_failure` with the entity the trigger fired for, so a lost notification is recorded in `audit_log` and surfaced to staff. The trigger's own work — the status change, the deactivation, the receipt — commits regardless.

For the four that also make outbound calls (`notify_operator_on_status_change`, `notify_driver_on_upload_status_change`, `notify_owner_on_pay_setup_submitted`, `notify_staff_on_release_note`), the `net.http` / `pg_notify` call goes inside the same protected block. An email gateway timeout must not roll back a driver's status change.

**The two RPCs.** `approve_application_correction` and `reject_application_correction` get the notification isolated, and a null guard on the recipient: when `requested_by_staff_id` is null, skip the insert and record it rather than attempting a NOT NULL violation. An approval that reached `applications` is never discarded because the staff notification could not be addressed.

**Comments carried in the migration**, because they are the assumptions the next author will make:
- AFTER triggers abort their firing statement. AFTER buys nothing here — all ten need the block.
- `priority` defaults to `'watch'`; the twelve that omit it were never exposed to the 23514. The exposure being closed is the general one.
- At `certify_rods_day`'s correction-request close, a comment stating that this UPDATE is deliberately **not** isolated: it is business logic that must be atomic with the certification and inserts no notifications, so the rule above does not apply. Written at the call site so the next person applying the pattern doesn't "fix" it.

## Part B — the structural guard

New file in `test:guards` (making it seven): every function in `public` whose body contains `INSERT INTO public.notifications` must either be `log_notification_delivery_failure` itself or have that insert inside an exception block.

Parsed positionally against live catalog bodies, which carries the same silent-no-match failure mode as the priority parser — so it gets the same treatment. Checked-in fixtures: an insert outside any block that the guard **must** flag, and the same insert inside a `BEGIN ... EXCEPTION` that it **must not**, plus the adversarial shapes that break naive parsing — a nested `BEGIN` inside a loop, an `INSERT ... SELECT` spanning lines, and the string `INSERT INTO public.notifications` inside a comment and inside a quoted literal. Meta-assertion: the parser must locate an insert in every positive fixture; zero matches fails rather than passes.

## Part C — §4 walkthrough, steps 3 through 7

**Step 3 — amend and certify.** Open amendment draft `b64f2429` (supersedes `689eb664`, log date 2026-08-01, demo operator `ee993ec0`). Reclassify the 14:00–15:00 segment named in the request, supply the written amendment reason, certify. Confirm by query:
- `certify_rods_day` returns `replayed: false`
- `689eb664` moves to `superseded` and stays locked; `b64f2429` is `certified`
- exactly one `rods_amendments` row per changed field, each carrying `original_day_id = 689eb664` and the reason
- request `a97cf4b8` flips to `actioned` with `resolved_by_day_id = b64f2429` and `resolved_at` set

**Step 4 — decline path.** Raise a second correction request, driver declines with a written response. Confirm the request records the response and does not close, the original stays certified and unamended, and staff see the decline on the row.

**Step 5 — offline no-op replay.** Replay step 3's certification with the same token. Confirm `replayed: true`, no second amendment row, no re-close of the already-actioned request.

**Step 6 — policy audit.** Confirm management and owner are read-only on `rods_days`, `rods_events`, `rods_amendments`, and that a management session cannot certify, amend, or edit a day.

**Step 7 — capture, then purge.** Step 7 destroys the evidence steps 3–6 produced, so the record is written first:

1. **Snapshot into the run doc** — all three `rods_days` rows with their statuses and supersedes chain, every `rods_amendments` row with `original_day_id` and reason, both correction requests with their dispositions and resolver, and the notification rows raised along the way. Written before anything is deleted.
2. **Purge** via the demo reset path, which resolves the amendment chain leaf-first.
3. **Assert zero** for that operator across `rods_days`, `rods_amendments`, `rods_correction_requests`, and the associated notifications.

If the purge fails partway — the case the leaf-first ordering guard exists for — the run doc still holds proof of what steps 3–6 established, instead of a half-purged database behind a report claiming all steps passed. A partial failure is reported as a partial failure, against the snapshot.

Every step verified by query against live rows, not by the UI reporting success.
