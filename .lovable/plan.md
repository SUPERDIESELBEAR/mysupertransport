## Confirmed before writing this (unchanged findings, plus two new)

- **`send-eld-malfunction-notice` fails on its first statement.** Line 123 embeds `operators!inner(... profiles(...))`; `operators.user_id` points at `auth.users`, so no such relationship exists. Every call returns `500 Could not load the malfunction event` — before the upload gate, before the demo branch, before the PDF read. Broken since the file was written, commit `2f1158be`, Wed Jul 29 23:17 UTC. `eld_malfunction_events` is empty (0 rows, 0 uploaded, 0 sent, 0 recorded errors), so no driver has hit it; the first real report would have.
- **`eld_malfunction_notifications` has exactly one policy: `eld_notifications_select_staff` (SELECT, `authenticated`).** No UPDATE policy, no DELETE policy, for any role. Append-only through PostgREST today. The gap is not policy, it is that a service-role writer bypasses RLS entirely — which is why the trigger below is the actual guard.
- **`day_number` has no reader yet** — only `process-eld-escalations` writes it; the semantics are still ours to define.
- **`pg_cron` and `pg_net` are installed**; the app role cannot read the `cron` schema, so observing a run needs the reader function in step 2.

## 1. Fix the notice embed — and make `dryRun` structurally unable to send

**Embed fix:** drop the nested `profiles(...)`, resolve the driver's name with a second read on `profiles` keyed by `operators.user_id`, keep the `'Driver'` fallback.

**`dryRun` shape:** the handler splits at the resolution point.

```text
resolveNotice(eventId) -> { event, driverName, unitNumber, recipients, subject, html }   // reads only
  |
  +-- dryRun  -> return the resolved summary. Returns here. No sender module in scope.
  |
  +-- live    -> deliverNotice(resolved, pdfBase64, authHeader)  // the only caller of sendResendDirect
                 -> stampSent(eventId)                            // the only writer of notice_sent_at
```

`sendResendDirect` is imported and called inside `deliverNotice` only, and `deliverNotice` is invoked from exactly one line — the non-dry branch, after `dryRun` has already returned. The dry branch never constructs a payload the sender could consume: it returns the summary object and exits. The PDF is not even downloaded on the dry path, so there is nothing to attach.

`notice_sent_at`, `notice_send_attempts`, and `notice_last_send_error` are written only inside `deliverNotice`/`stampSent`, which the dry path cannot reach. A dry run therefore writes no `notice_sent_at`, no `email_send_log` row (that row is written by `sendResendDirect`, which is never called), and no ledger row (this function does not write the escalation ledger at all).

**Verification:** seed a scratch event on a real operator with a small uploaded PDF, call with `dryRun`, assert the response carries the resolved driver name, unit, recipient list, and subject — then re-read the event row and assert `notice_sent_at IS NULL` and `notice_send_attempts` unchanged, and assert zero new `email_send_log` rows for the label `eld_malfunction_notice`. Then a demo-operator call to prove the `suppressed: true` branch (also previously unreachable) is now reached. Scratch rows deleted, counts re-asserted at zero.

## 2. Land the cron with an observed run

Registration goes through the data tool, not a migration — the statement embeds the project URL and anon key and must not travel to a remix.

1. Register at `*/10 * * * *`. Wait for a real scheduled fire and read it out of `cron.job_run_details`.
2. Once observed, alter to hourly at `:10`.

Hourly is the steady state: the ladder is day-granular, but driver-facing rows are held outside 07:00–21:00 home-terminal time, so the job must come back after the quiet window opens. Repeat runs inside a day are no-ops by dedupe.

Add `public.eld_cron_status()` (`SECURITY DEFINER`, pinned `search_path`, executable by management and owner) returning the job row plus recent `cron.job_run_details`. §3's console needs a "last run" indicator, so this is a component, not scaffolding.

**Quiet run:** every open, non-demo, unacknowledged event is evaluated; none is on a rung, none is inside an unacknowledged 24h/72h step, none has an unoffered extension window. Response: `success: true`, `events: N`, `ledger_rows_inserted: 0`, `emails_sent: 0`, `results: []`; pg_cron records `succeeded`. That is most hours. `events: N` plus the `job_run_details` row is what separates "nothing to do" from "never woke up".

## 3. `day_number` semantics

Document per type in the ledger's header comment: `escalation_day` — the rung; `extension_prompt` — the day the one-time prompt fired, not a rung; `ack_overdue` — `NULL`, with the 24h/72h step in the reason text. Add a test asserting a rung query filters on `notification_type = 'escalation_day'`, so the console cannot read a prompt row as a rung.

## 4. Override runs: audit entry plus an immutable ledger flag

- **`audit_log` row per override run** — action `eld_escalation_override_run`, actor from the caller's JWT, metadata with the `nowOverride` value, channels, event filter, and resulting counts. Answers "who made the ladder believe it was a different day".
- **`is_override boolean not null default false` on `eld_malfunction_notifications`** (migration), set true on any run with `nowOverride` or a channel override. Answers "is this row evidence".

**Immutability:** `BEFORE UPDATE` trigger on the table, same treatment as `record_source` and `is_demo`, raising its own SQLSTATE when `NEW.is_override IS DISTINCT FROM OLD.is_override`. No privileged exemption path — not for the service role, not for a staff role, no `rods.privileged`-style bypass. The one column protecting the ledger's credibility cannot be cleared by any UPDATE.

Also assert in the migration's accompanying test that the table still has no UPDATE and no DELETE policy for any role (currently true: one SELECT policy for `authenticated`), so append-only stays append-only.

The console's timeliness column reads only `is_override = false` rows.

## 5. APP_URL

`buildAppUrl` already `console.warn`s on every fallback, and the escalation logs show it firing on every invocation — visible, but only to someone reading function logs. Rather than rely on that, fix it now: the current `APP_URL` value is not a URL at all, so it gets deleted and the function falls back to the published host by design, or it is set to the published origin explicitly. Either way the warning stops, and a persisting warning afterward means a real regression instead of steady-state noise.

## Verification list

1. Dry run returns a resolved name, unit, recipients, and subject — and writes no `notice_sent_at`, no attempt increment, no `email_send_log` row.
2. Demo-operator call reaches the `suppressed: true` branch.
3. `cron.job_run_details` shows a real scheduled invocation with its status, before the schedule is relaxed to hourly.
4. A quiet run recorded and reported as `events: N`, zero rows, zero emails, `succeeded`.
5. Override run writes one `audit_log` row and ledger rows with `is_override = true`; a normal run writes neither. A direct UPDATE attempting to clear `is_override` raises the trigger's SQLSTATE.
6. `eld_malfunction_notifications` still has no UPDATE or DELETE policy for any role.
7. All scratch rows removed, counts re-asserted at zero.

## Technical notes

- Files: `supabase/functions/send-eld-malfunction-notice/index.ts` (split into `resolveNotice` / `deliverNotice`), `supabase/functions/process-eld-escalations/index.ts`, one migration (`is_override`, its immutability trigger, `eld_cron_status()`), one data-tool statement for `cron.schedule`, plus tests.
- Both edge functions redeploy after editing.
